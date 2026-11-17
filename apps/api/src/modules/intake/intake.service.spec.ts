/* eslint-disable @typescript-eslint/no-explicit-any */
import { PATH_METADATA } from '@nestjs/common/constants';
import {
  AuthUserDto,
  BUILT_IN_INTAKE_FORMS,
  INTAKE_EXIT_MAX_ATTEMPTS,
  IntakeStatus,
  Role,
  SOCKET_EVENTS,
} from '@reform/shared';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../storage/storage.service';
import { IntakeDefinitionsService } from './intake-definitions.service';
import { IntakeDeviceController, IntakeGuestController } from './intake-guest.controller';
import { verifySnapshot } from './intake-snapshot';
import { FakePrisma } from './intake.fake-prisma.spec-helper';
import { IntakeDeviceGuard, IntakeGuestGuard } from './intake.guards';
import { IntakeService } from './intake.service';

const STUDIO = 'default-studio';
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PHOTO = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

const staff: AuthUserDto = {
  id: 'staff-1',
  studioId: STUDIO,
  email: 'reka@reformstudio.hu',
  name: 'Kiss Réka',
  role: Role.RECEPTIONIST,
};

/** A közös és a köredzés űrlapjainak hiánytalan válaszai (a vendég „kitölti”). */
const COMPLETE_ANSWERS: Record<string, Record<string, string | string[]>> = {
  'privacy-notice': { privacyRead: 'ACCEPTED' },
  'guest-profile': {
    lastName: 'Fekete',
    firstName: 'Ödön',
    birthDate: '1988-04-02',
    phone: '+36 30 111 2233',
    email: 'odon@example.com',
    gender: 'MALE',
  },
  'health-data-consent': { healthConsent: 'ACCEPTED' },
  'health-questionnaire': {
    surgeryLast6Weeks: 'YES',
    labLast6Months: 'NO',
    goals: ['FITNESS'],
    fluidIntake: '1_2L',
    workType: 'SEDENTARY',
  },
  'circuit-contraindications': {
    cardiovascular: 'NO',
    uncontrolledBloodPressure: 'NO',
    jointOrSpine: 'NO',
    pregnancy: 'NO',
  },
  'circuit-membership-contract': { membershipTerm: '3', termsAccepted: 'ACCEPTED' },
  'hypoxi-contraindications': {
    venousDisease: 'NO',
    heartCondition: 'NO',
    pregnancy: 'NO',
    recentSurgeryAbdomen: 'NO',
  },
  'hypoxi-informed-consent': { informedConsent: 'ACCEPTED' },
  'marketing-consent': { marketingPhotoVideo: 'NO', marketingMessages: 'YES' },
};

const contextFor = (headers: Record<string, string>) => {
  const request: any = { headers };
  return {
    request,
    context: { switchToHttp: () => ({ getRequest: () => request }) } as any,
  };
};

describe('IntakeService — tabletes vendégfelvétel (TICKET-56)', () => {
  let db: FakePrisma;
  let env: Record<string, string | undefined>;
  let storageDir: string;
  let service: IntakeService;
  let gateway: { emitToDevice: ReturnType<typeof vi.fn>; emitIntakeUpdated: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let pdf: { render: ReturnType<typeof vi.fn> };
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
  let guestGuard: IntakeGuestGuard;

  /** A vendégmód kérésenként friss munkamenetet kap (mint a guard élesben). */
  const asGuest = async (token: string) => {
    const { request, context } = contextFor({ 'x-intake-token': token });
    await guestGuard.canActivate(context);
    return request.intakeSession;
  };

  const fillAll = async (token: string) => {
    const view = await service.getGuestView(await asGuest(token));
    for (const form of view.forms) {
      await service.saveGuestAnswers(await asGuest(token), form.key, COMPLETE_ANSWERS[form.key]);
    }
  };

  const prepareNewGuest = async (packageKeys = ['CIRCUIT']) => {
    const detail = await service.createSession(
      { newGuest: { lastName: 'Fekete', firstName: 'Ödön' }, packageKeys, source: 'PC' },
      staff,
    );
    const { guestToken, exitCode } = await service.startGuestMode(detail.id, staff);
    return { sessionId: detail.id, guestToken, exitCode };
  };

  const submitted = async (packageKeys = ['CIRCUIT']) => {
    const prepared = await prepareNewGuest(packageKeys);
    await fillAll(prepared.guestToken);
    await service.submitGuest(await asGuest(prepared.guestToken), SIGNATURE);
    return prepared;
  };

  beforeEach(() => {
    db = new FakePrisma();
    db.seed('user', { id: staff.id, email: staff.email, name: staff.name });
    db.seed('guest', {
      id: 'guest-other',
      barcode: '100009',
      firstName: 'Titkos',
      lastName: 'Másvendég',
      email: 'titkos@example.com',
      phone: '+36 70 999 8877',
      birthDate: new Date('1970-01-01T00:00:00.000Z'),
    });
    storageDir = mkdtempSync(join(tmpdir(), 'intake-storage-'));
    env = { NODE_ENV: 'test', JWT_SECRET: 'test-secret', LOCAL_STORAGE_DIR: storageDir };
    const config = { get: (key: string) => env[key] } as any;
    gateway = { emitToDevice: vi.fn(), emitIntakeUpdated: vi.fn() };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    pdf = { render: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.7 teszt')) };
    jwt = { signAsync: vi.fn().mockResolvedValue('staff-jwt') };
    service = new IntakeService(
      db as any,
      new IntakeDefinitionsService(db as any),
      pdf as any,
      new StorageService(config),
      mail as any,
      config,
      jwt as any,
      gateway as any,
    );
    guestGuard = new IntakeGuestGuard(db as any);
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  describe('előkészítés és duplikáció-ellenőrzés', () => {
    it('új vendégnél a közös és a csomag űrlapjait kéri, előkészített állapotban', async () => {
      const detail = await service.createSession(
        { newGuest: { lastName: 'Fekete', firstName: 'Ödön' }, packageKeys: ['CIRCUIT'], source: 'PC' },
        staff,
      );

      expect(detail.status).toBe(IntakeStatus.PREPARED);
      expect(detail.forms.map((f) => f.key)).toEqual([
        'privacy-notice',
        'guest-profile',
        'health-data-consent',
        'health-questionnaire',
        'circuit-contraindications',
        'circuit-membership-contract',
        'marketing-consent',
      ]);
      expect(detail.answers['guest-profile']).toMatchObject({ lastName: 'Fekete', firstName: 'Ödön' });
      expect(db.tables.auditLog.map((a) => a.action)).toContain('INTAKE_CREATED');
    });

    it('egyező telefonszámnál figyelmeztet, a megerősítés után létrehozza', async () => {
      const newGuest = { lastName: 'Új', firstName: 'Vendég', phone: '06 70 999 8877' };

      await expect(
        service.createSession({ newGuest, packageKeys: ['CIRCUIT'], source: 'PC' }, staff),
      ).rejects.toMatchObject({
        code: 'INTAKE.DUPLICATE_SUSPECTED',
        status: 409,
        details: { duplicates: [expect.objectContaining({ guestId: 'guest-other', matchedOn: ['PHONE'] })] },
      });
      expect(db.tables.intakeSession).toHaveLength(0);

      const detail = await service.createSession(
        { newGuest, packageKeys: ['CIRCUIT'], source: 'PC', acknowledgeDuplicates: true },
        staff,
      );
      expect(detail.status).toBe(IntakeStatus.PREPARED);
    });

    it('ismeretlen vagy hiányzó csomag, hiányzó vendég: hiba', async () => {
      await expect(
        service.createSession({ newGuest: {}, packageKeys: ['PILATES'], source: 'PC' }, staff),
      ).rejects.toMatchObject({ code: 'INTAKE.PACKAGE_UNKNOWN' });
      await expect(
        service.createSession({ newGuest: {}, packageKeys: [], source: 'PC' }, staff),
      ).rejects.toMatchObject({ code: 'INTAKE.PACKAGE_REQUIRED' });
      await expect(
        service.createSession({ packageKeys: ['CIRCUIT'], source: 'TABLET' }, staff),
      ).rejects.toMatchObject({ code: 'INTAKE.GUEST_REQUIRED' });
    });

    it('több szolgáltatásnál egy profil marad: csak a hiányzó szolgáltatásspecifikus dokumentumokat kéri', async () => {
      const first = await submitted(['CIRCUIT']);
      await service.approve(first.sessionId, staff);
      const guestId = db.tables.intakeSession[0].guestId;

      const hypoxi = await service.createSession({ guestId, packageKeys: ['HYPOXI'], source: 'PC' }, staff);
      expect(hypoxi.forms.map((f) => f.key)).toEqual(['hypoxi-contraindications', 'hypoxi-informed-consent']);

      await expect(
        service.createSession({ guestId, packageKeys: ['CIRCUIT'], source: 'PC' }, staff),
      ).rejects.toMatchObject({ code: 'INTAKE.NOTHING_MISSING' });
      expect(db.tables.guest).toHaveLength(2);
    });
  });

  describe('vendégmód: hatókör és állapotgép', () => {
    it('a vendégmód végpontjai nem fogadnak azonosítót, csak a tokenből dolgoznak', () => {
      const guestRoutes = ['view', 'answers', 'photo', 'submit', 'exit'].map((name) =>
        Reflect.getMetadata(PATH_METADATA, (IntakeGuestController.prototype as any)[name]),
      );
      const deviceRoutes = [Reflect.getMetadata(PATH_METADATA, IntakeDeviceController.prototype.claim)];
      for (const path of [...guestRoutes, ...deviceRoutes]) expect(path).not.toContain(':');
      expect(Reflect.getMetadata('__guards__', IntakeGuestController)).toEqual([IntakeGuestGuard]);
      expect(Reflect.getMetadata('__guards__', IntakeDeviceController)).toEqual([IntakeDeviceGuard]);
    });

    it('a vendég csak a saját kitöltését látja; más vendég adata nem kerül a válaszba', async () => {
      const { guestToken } = await prepareNewGuest();
      const view = await service.getGuestView(await asGuest(guestToken));

      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain('Másvendég');
      expect(serialized).not.toContain('titkos@example.com');
      expect(serialized).not.toContain('guest-other');
      expect(Object.keys(view).sort()).toEqual(
        ['answers', 'expiresAt', 'forms', 'hasProfilePhoto', 'packageLabels', 'sessionId', 'status'].sort(),
      );
    });

    it('token nélkül, hamis vagy lejárt tokennel a vendégmód elutasít', async () => {
      const { guestToken, sessionId } = await prepareNewGuest();
      await expect(guestGuard.canActivate(contextFor({}).context)).rejects.toMatchObject({
        code: 'INTAKE.GUEST_TOKEN_INVALID',
        status: 401,
      });
      await expect(asGuest('hamis-token')).rejects.toMatchObject({ code: 'INTAKE.GUEST_TOKEN_INVALID' });

      db.tables.intakeSession.find((s) => s.id === sessionId)!.guestTokenExpiresAt = new Date(Date.now() - 1000);
      await expect(asGuest(guestToken)).rejects.toMatchObject({ code: 'INTAKE.GUEST_TOKEN_INVALID' });
    });

    it('egészségügyi válasz csak a hozzájárulás után, és külön táblába kerül', async () => {
      const { guestToken, sessionId } = await prepareNewGuest();
      const health = COMPLETE_ANSWERS['health-questionnaire'];

      await expect(
        service.saveGuestAnswers(await asGuest(guestToken), 'health-questionnaire', health),
      ).rejects.toMatchObject({ code: 'INTAKE.ANSWERS_INCOMPLETE' });

      await service.saveGuestAnswers(await asGuest(guestToken), 'health-data-consent', { healthConsent: 'ACCEPTED' });
      const { warnings } = await service.saveGuestAnswers(
        await asGuest(guestToken),
        'health-questionnaire',
        health,
      );

      expect(warnings).toEqual([expect.objectContaining({ questionId: 'surgeryLast6Weeks' })]);
      const session = db.tables.intakeSession.find((s) => s.id === sessionId)!;
      expect(session.status).toBe(IntakeStatus.GUEST_FILLING);
      expect(session.answers['health-questionnaire']).toBeUndefined();
      expect(db.tables.intakeHealthRecord[0]).toMatchObject({
        sessionId,
        answers: { 'health-questionnaire': expect.objectContaining({ surgeryLast6Weeks: 'YES' }) },
      });
      expect(db.tables.intakeHealthRecord[0].consentGivenAt).toBeInstanceOf(Date);

      // Az általános nézet egészségügyi válasz nélkül; a jogosult végpont auditál.
      const detail = await service.getDetail(sessionId, STUDIO);
      expect(detail.answers['health-questionnaire']).toBeUndefined();
      const healthView = await service.getHealth(sessionId, staff);
      expect(healthView.answers['health-questionnaire'].surgeryLast6Weeks).toBe('YES');
      expect(healthView.warnings).toHaveLength(1);
      expect(db.tables.auditLog.map((a) => a.action)).toContain('HEALTH_DATA_READ');
    });

    it('ismeretlen kérdés és rejtett (feltételes) válasz nem mentődik', async () => {
      const { guestToken, sessionId } = await prepareNewGuest();
      await service.saveGuestAnswers(await asGuest(guestToken), 'health-data-consent', { healthConsent: 'ACCEPTED' });
      await service.saveGuestAnswers(await asGuest(guestToken), 'health-questionnaire', {
        labLast6Months: 'NO',
        cholesterolTotal: 'HIGH',
        hackelt: 'x',
      });
      const stored = db.tables.intakeHealthRecord[0].answers['health-questionnaire'];
      expect(stored).toEqual({ labLast6Months: 'NO' });
      expect(db.tables.intakeSession.find((s) => s.id === sessionId)!.answers.hackelt).toBeUndefined();
    });

    it('beküldés: hiányos válasznál a hiányzó kérdéseket adja vissza, teljesnél ellenőrzésre vár', async () => {
      const { guestToken, sessionId } = await prepareNewGuest();
      await service.saveGuestAnswers(await asGuest(guestToken), 'privacy-notice', { privacyRead: 'ACCEPTED' });

      await expect(service.submitGuest(await asGuest(guestToken), SIGNATURE)).rejects.toMatchObject({
        code: 'INTAKE.ANSWERS_INCOMPLETE',
        details: { missing: expect.arrayContaining([expect.objectContaining({ formKey: 'marketing-consent' })]) },
      });

      await fillAll(guestToken);
      const view = await service.submitGuest(await asGuest(guestToken), SIGNATURE);
      expect(view.status).toBe(IntakeStatus.AWAITING_REVIEW);
      expect(gateway.emitIntakeUpdated).toHaveBeenCalledWith(
        { sessionId, status: IntakeStatus.AWAITING_REVIEW },
        STUDIO,
      );

      // Beküldés után a vendég már nem írhat.
      await expect(
        service.saveGuestAnswers(await asGuest(guestToken), 'privacy-notice', { privacyRead: 'ACCEPTED' }),
      ).rejects.toMatchObject({ code: 'INTAKE.INVALID_TRANSITION' });
    });

    it('a profilkép külön mentődik, a túl nagy kép elutasítva', async () => {
      const { guestToken, sessionId } = await prepareNewGuest();
      await service.saveGuestPhoto(await asGuest(guestToken), PHOTO);
      expect(db.tables.intakeSession.find((s) => s.id === sessionId)!.profilePhotoDataUrl).toBe(PHOTO);

      const huge = `data:image/webp;base64,${'A'.repeat(1_100_000)}`;
      await expect(service.saveGuestPhoto(await asGuest(guestToken), huge)).rejects.toMatchObject({
        code: 'INTAKE.PHOTO_TOO_LARGE',
      });
    });

    it('kilépés csak a munkatárs kódjával; hibás kód után zárol, helyes kódra új munkatársi munkamenet', async () => {
      const { guestToken, exitCode } = await prepareNewGuest();
      const wrong = exitCode === '111111' ? '222222' : '111111';

      for (let i = 0; i < INTAKE_EXIT_MAX_ATTEMPTS; i++) {
        await expect(service.exitGuestMode(await asGuest(guestToken), wrong)).rejects.toMatchObject({
          code: 'INTAKE.EXIT_CODE_INVALID',
        });
      }
      await expect(service.exitGuestMode(await asGuest(guestToken), exitCode)).rejects.toMatchObject({
        code: 'INTAKE.EXIT_LOCKED',
      });
    });

    it('helyes kilépési kód: a vendégtoken megszűnik, a munkatárs új munkamenetet kap', async () => {
      const { guestToken, exitCode } = await prepareNewGuest();
      const result = await service.exitGuestMode(await asGuest(guestToken), exitCode);

      expect(result).toEqual({
        released: true,
        staff: { accessToken: 'staff-jwt', user: expect.objectContaining({ id: staff.id }) },
      });
      expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: staff.id }));
      await expect(asGuest(guestToken)).rejects.toMatchObject({ code: 'INTAKE.GUEST_TOKEN_INVALID' });
    });
  });

  describe('PC → tablet átadás', () => {
    it('csak párosított tabletre küldhető; a tablet átveszi, és a régi vendégtoken nem él', async () => {
      const monitor = db.seed('displayDevice', { name: 'Pult monitor', deviceToken: 'mon-token' });
      const tablet = db.seed('displayDevice', { name: 'Lenovo tablet', kind: 'TABLET', deviceToken: 'tab-token' });
      const detail = await service.createSession(
        { newGuest: { lastName: 'Fekete', firstName: 'Ödön' }, packageKeys: ['HYPOXI'], source: 'PC' },
        staff,
      );

      await expect(service.sendToDevice(detail.id, monitor.id, staff)).rejects.toMatchObject({
        code: 'INTAKE.DEVICE_NOT_TABLET',
      });

      const sent = await service.sendToDevice(detail.id, tablet.id, staff);
      expect(sent).toMatchObject({ deviceName: 'Lenovo tablet', exitCode: expect.stringMatching(/^\d{6}$/) });
      expect(gateway.emitToDevice).toHaveBeenCalledWith(SOCKET_EVENTS.INTAKE_ASSIGNED, {
        sessionId: detail.id,
        deviceId: tablet.id,
      });

      // Az eszköztoken-őr csak tabletet enged.
      const deviceGuard = new IntakeDeviceGuard(db as any);
      await expect(
        deviceGuard.canActivate(contextFor({ 'x-device-token': 'mon-token' }).context),
      ).rejects.toMatchObject({ code: 'INTAKE.DEVICE_NOT_TABLET' });
      const { request, context } = contextFor({ 'x-device-token': 'tab-token' });
      await deviceGuard.canActivate(context);

      const assignment = await service.claimForDevice(request.device);
      expect(assignment?.sessionId).toBe(detail.id);
      expect((await asGuest(assignment!.guestToken)).id).toBe(detail.id);

      // Újabb átvétel új tokent ad, a korábbi érvénytelen.
      const again = await service.claimForDevice(request.device);
      await expect(asGuest(assignment!.guestToken)).rejects.toMatchObject({ code: 'INTAKE.GUEST_TOKEN_INVALID' });
      expect((await asGuest(again!.guestToken)).id).toBe(detail.id);

      // Másik tablet nem veheti át.
      const other = db.seed('displayDevice', { name: 'Másik tablet', kind: 'TABLET', deviceToken: 'tab-2' });
      expect(await service.claimForDevice(other as any)).toBeNull();
    });

    it('a recepció lezárja a vendégmódot: a tablet értesül, a token megszűnik', async () => {
      const tablet = db.seed('displayDevice', { name: 'Lenovo tablet', kind: 'TABLET', deviceToken: 'tab-token' });
      const detail = await service.createSession(
        { newGuest: { lastName: 'Fekete', firstName: 'Ödön' }, packageKeys: ['CIRCUIT'], source: 'PC' },
        staff,
      );
      await service.sendToDevice(detail.id, tablet.id, staff);
      const assignment = await service.claimForDevice(tablet as any);

      await service.releaseGuestMode(detail.id, staff);

      expect(gateway.emitToDevice).toHaveBeenCalledWith(SOCKET_EVENTS.INTAKE_RELEASED, {
        sessionId: detail.id,
        deviceId: tablet.id,
      });
      await expect(asGuest(assignment!.guestToken)).rejects.toMatchObject({ code: 'INTAKE.GUEST_TOKEN_INVALID' });
      expect(await service.claimForDevice(tablet as any)).toBeNull();
    });
  });

  describe('jóváhagyás és szinkron', () => {
    it('csak ellenőrzésre váró kitöltés hagyható jóvá', async () => {
      const { sessionId } = await prepareNewGuest();
      await expect(service.approve(sessionId, staff)).rejects.toMatchObject({
        code: 'INTAKE.INVALID_TRANSITION',
      });
    });

    it('új vendég: a profil, a mérés, a profilkép és a pillanatképek egy tranzakcióban; utána PDF és lezárás', async () => {
      const { sessionId, guestToken } = await prepareNewGuest();
      await service.saveGuestPhoto(await asGuest(guestToken), PHOTO);
      await fillAll(guestToken);
      await service.submitGuest(await asGuest(guestToken), SIGNATURE);
      await service.updateSession(
        sessionId,
        { measurements: { weightKg: 82.4, bmi: 26.1, skeletalMusclePct: 33.5, calfCm: 38, hipCm: -1 } },
        staff,
      );

      const detail = await service.approve(sessionId, staff);

      expect(detail.status).toBe(IntakeStatus.COMPLETED);
      const guest = db.tables.guest.find((g) => g.id === detail.guestId)!;
      expect(guest).toMatchObject({
        lastName: 'Fekete',
        firstName: 'Ödön',
        email: 'odon@example.com',
        phone: '+36 30 111 2233',
        gender: 'MALE',
      });
      expect(guest.birthDate.toISOString().slice(0, 10)).toBe('1988-04-02');
      expect(guest.barcode).toMatch(/^RS\d{6}$/);

      expect(db.tables.measurement).toEqual([
        expect.objectContaining({
          guestId: guest.id,
          intakeSessionId: sessionId,
          weightKg: 82.4,
          bmi: 26.1,
          skeletalMusclePct: 33.5,
          calfCm: 38,
          recordedById: staff.id,
        }),
      ]);
      expect(db.tables.measurement[0].hipCm).toBeUndefined();
      expect(db.tables.guestPhoto).toEqual([
        expect.objectContaining({ guestId: guest.id, purpose: 'PROFILE', fileUrl: PHOTO }),
      ]);
      expect(db.tables.intakeHealthRecord[0]).toMatchObject({ guestId: guest.id });
      expect(db.tables.intakeHealthRecord[0].approvedAt).toBeInstanceOf(Date);

      // Aláírandó űrlaponként egy pillanatkép, a profil nem dokumentum.
      expect(detail.snapshots.map((s) => s.formKey)).toEqual([
        'privacy-notice',
        'health-data-consent',
        'health-questionnaire',
        'circuit-contraindications',
        'circuit-membership-contract',
        'marketing-consent',
      ]);
      expect(detail.snapshots.every((s) => s.pdfAvailable)).toBe(true);
      expect(pdf.render).toHaveBeenCalledTimes(6);
      expect(db.tables.auditLog.map((a) => a.action)).toEqual(
        expect.arrayContaining(['INTAKE_APPROVED', 'HEALTH_DATA_APPROVED']),
      );
      expect(db.tables.auditLog.find((a) => a.action === 'INTAKE_APPROVED')!.userId).toBe(staff.id);
    });

    it('meglévő vendég: a profil frissül, új vendég nem jön létre', async () => {
      const existing = db.seed('guest', { id: 'guest-1', barcode: '100001', firstName: 'Anna', lastName: 'Kovács' });
      const detail = await service.createSession({ guestId: existing.id, packageKeys: ['HYPOXI'], source: 'PC' }, staff);
      const { guestToken } = await service.startGuestMode(detail.id, staff);
      await fillAll(guestToken);
      await service.submitGuest(await asGuest(guestToken), SIGNATURE);
      await service.updateSession(detail.id, { profile: { email: 'anna.uj@example.com' } }, staff);

      const approved = await service.approve(detail.id, staff);

      expect(approved.guestId).toBe(existing.id);
      expect(db.tables.guest).toHaveLength(2);
      expect(db.tables.guest.find((g) => g.id === existing.id)!.email).toBe('anna.uj@example.com');
    });

    it('duplikátumnál a recepciós a meglévő vendéghez kapcsolja', async () => {
      const detail = await service.createSession(
        { newGuest: { lastName: 'Másvendég', firstName: 'Titkos' }, packageKeys: ['CIRCUIT'], source: 'TABLET', acknowledgeDuplicates: true },
        staff,
      );
      expect((await service.getDetail(detail.id, STUDIO)).duplicates[0]).toMatchObject({ guestId: 'guest-other' });
      const { guestToken } = await service.startGuestMode(detail.id, staff);
      await fillAll(guestToken);
      await service.submitGuest(await asGuest(guestToken), SIGNATURE);
      await service.updateSession(detail.id, { linkGuestId: 'guest-other' }, staff);

      const approved = await service.approve(detail.id, staff);

      expect(approved.guestId).toBe('guest-other');
      expect(db.tables.guest).toHaveLength(1);
    });

    it('hibánál a tranzakció visszagördül: nincs félkész vendég, a kitöltés ellenőrzésre vár', async () => {
      const { sessionId } = await submitted();
      await service.updateSession(sessionId, { measurements: { weightKg: 70 } }, staff);
      const originalCreate = db.measurement.create;
      db.measurement.create = vi.fn().mockRejectedValue(new Error('adatbázis hiba'));

      await expect(service.approve(sessionId, staff)).rejects.toThrow('adatbázis hiba');

      db.measurement.create = originalCreate;
      expect(db.tables.guest).toHaveLength(1);
      expect(db.tables.intakeDocumentSnapshot).toHaveLength(0);
      expect(db.tables.intakeSession[0].status).toBe(IntakeStatus.AWAITING_REVIEW);
      // Javítás után újra jóváhagyható.
      expect((await service.approve(sessionId, staff)).status).toBe(IntakeStatus.COMPLETED);
    });

    it('párhuzamos második jóváhagyás nem duplikál', async () => {
      const { sessionId } = await submitted();
      await service.approve(sessionId, staff);
      await expect(service.approve(sessionId, staff)).rejects.toMatchObject({
        code: 'INTAKE.INVALID_TRANSITION',
      });
      expect(db.tables.guest).toHaveLength(2);
    });

    it('javításra visszaküldve új aláírás kell', async () => {
      const { sessionId, guestToken } = await submitted();
      const detail = await service.returnToGuest(sessionId, staff);
      expect(detail.status).toBe(IntakeStatus.GUEST_FILLING);
      expect(detail.signatureDataUrl).toBeNull();
      await expect(service.approve(sessionId, staff)).rejects.toMatchObject({ code: 'INTAKE.INVALID_TRANSITION' });
      await service.submitGuest(await asGuest(guestToken), SIGNATURE);
      expect((await service.approve(sessionId, staff)).status).toBe(IntakeStatus.COMPLETED);
    });
  });

  describe('változatlan pillanatkép', () => {
    it('a pillanatkép az aláíráskori szöveget és verziót őrzi, új definíció-verzió után is', async () => {
      const { sessionId } = await submitted();
      await service.approve(sessionId, staff);
      const v1 = BUILT_IN_INTAKE_FORMS.find((f) => f.key === 'privacy-notice')!;
      db.seed('intakeFormDefinition', {
        key: v1.key,
        version: 2,
        title: 'Adatkezelési tájékoztató (2)',
        kind: v1.kind,
        scope: v1.scope,
        sortOrder: v1.order,
        bodyText: 'Új, felülvizsgált szöveg',
        questions: v1.questions,
      });

      const snapshot = db.tables.intakeDocumentSnapshot.find((s) => s.formKey === 'privacy-notice')!;
      expect(snapshot).toMatchObject({ formVersion: 1, title: v1.title, bodyText: v1.bodyText });
      expect(snapshot.signatureDataUrl).toBe(SIGNATURE);
      expect(verifySnapshot(snapshot as any, snapshot.contentHash)).toBe(true);
      expect(verifySnapshot({ ...snapshot, bodyText: 'átírt' } as any, snapshot.contentHash)).toBe(false);

      // A tartalmi oszlop módosítása (mint a DB trigger) elutasítva; a PDF adatai írhatók.
      await expect(
        db.intakeDocumentSnapshot.update({ where: { id: snapshot.id }, data: { bodyText: 'x' } }),
      ).rejects.toThrow('nem módosítható');

      // Új felvétel már az új verziót kéri.
      const forms = await service.listForms();
      expect(forms.find((f) => f.key === 'privacy-notice')!.version).toBe(2);
    });
  });

  describe('tárolás és lezárás', () => {
    it('production módban beállítás nélkül „nincs beállítva” hiba: FAILED, nem összeomlás; beállítás után újrapróbálható', async () => {
      const { sessionId } = await submitted();
      env.NODE_ENV = 'production';

      const failed = await service.approve(sessionId, staff);

      expect(failed.status).toBe(IntakeStatus.FAILED);
      expect(failed.failureReason).toContain('nincs beállítva');
      expect(failed.guestId).not.toBeNull();
      expect(failed.snapshots.every((s) => !s.pdfAvailable)).toBe(true);

      env.NODE_ENV = 'test';
      const retried = await service.retry(sessionId, staff);
      expect(retried.status).toBe(IntakeStatus.COMPLETED);
      expect(retried.snapshots.every((s) => s.pdfAvailable)).toBe(true);
      expect(db.tables.guest).toHaveLength(2);
    });

    it('csak sikertelen lezárás próbálható újra', async () => {
      const { sessionId } = await submitted();
      await service.approve(sessionId, staff);
      await expect(service.retry(sessionId, staff)).rejects.toMatchObject({ code: 'INTAKE.INVALID_TRANSITION' });
    });

    it('a PDF a vendégprofilon visszakereshető, lejáró linkkel megnyitható (naplózva)', async () => {
      const { sessionId } = await submitted();
      const detail = await service.approve(sessionId, staff);

      const documents = await service.listGuestDocuments(detail.guestId!, STUDIO);
      expect(documents).toHaveLength(6);
      const link = await service.documentLink(documents[0].id, staff);
      expect(link.url).toMatch(/^\/storage\/local\//);
      expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(db.tables.auditLog.map((a) => a.action)).toContain('INTAKE_DOCUMENT_VIEWED');

      await expect(service.documentLink(documents[0].id, { ...staff, studioId: 'masik-studio' })).rejects.toMatchObject({
        code: 'INTAKE.DOCUMENT_NOT_FOUND',
      });
    });
  });

  describe('e-mail csatolmánnyal', () => {
    it('a PDF csatolmányként megy ki, a levél a MessageLog-ba kerül', async () => {
      const { sessionId } = await submitted();
      const detail = await service.approve(sessionId, staff);
      const [document] = await service.listGuestDocuments(detail.guestId!, STUDIO);

      await expect(service.sendDocumentEmail(document.id, staff)).resolves.toEqual({ sent: true });

      expect(mail.send).toHaveBeenCalledWith(
        { email: 'odon@example.com', name: 'Fekete Ödön' },
        expect.objectContaining({ subject: expect.stringContaining(document.title) }),
        { attachments: [{ filename: `${document.formKey}-v1.pdf`, content: Buffer.from('%PDF-1.7 teszt') }] },
      );
      expect(db.tables.messageLog).toEqual([
        expect.objectContaining({ messageType: 'INTAKE_DOCUMENT', status: 'SENT', recipientEmail: 'odon@example.com' }),
      ]);
    });

    it('sikertelen küldés: FAILED napló és hibaüzenet; e-mail cím nélkül nem küldhető', async () => {
      const { sessionId } = await submitted();
      const detail = await service.approve(sessionId, staff);
      const [document] = await service.listGuestDocuments(detail.guestId!, STUDIO);
      mail.send.mockRejectedValueOnce(new Error('SendPulse hiba'));

      await expect(service.sendDocumentEmail(document.id, staff)).rejects.toMatchObject({
        code: 'INTAKE.MAIL_FAILED',
      });
      expect(db.tables.messageLog[0]).toMatchObject({ status: 'FAILED' });

      db.tables.guest.find((g) => g.id === detail.guestId)!.email = null;
      await expect(service.sendDocumentEmail(document.id, staff)).rejects.toMatchObject({
        code: 'INTAKE.EMAIL_MISSING',
      });
    });
  });

  it('megszakítás: lezárt kitöltés nem szakítható meg', async () => {
    const { sessionId } = await prepareNewGuest();
    expect((await service.cancel(sessionId, staff)).status).toBe(IntakeStatus.CANCELLED);
    await expect(service.cancel(sessionId, staff)).rejects.toMatchObject({ code: 'INTAKE.INVALID_TRANSITION' });
  });
});
