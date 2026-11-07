# ReformStudioSync — Recepciós és Valós Idejű Vendégmonitor Rendszer

A **ReformStudioSync** egy dedikált fitnesz- és Reformer Pilates stúdiókezelő webalkalmazás valós idejű ügyfélkijelzővel (Vendégmonitor), atomi tranzakciókezeléssel, 0 Ft-os havi felhő-infrastruktúra célkitűzéssel és SaaS-ready (`studioId`) adatmodellel.

## Főbb Modulok és Funkciók

1. **Recepciós Munkafelület (`/reception`):**
   - Globális fizikai vonalkódolvasó (`useBarcodeScanner`) támogatás fókusz-vesztés nélkül.
   - Atomi beléptetés 10 másodperces dupla-lehúzás védelemmel (Cooldown) és automatikus bérlet-priorizálással (`TIME_BASED` -> leghamarabb lejáró `OCCASION_BASED`).
   - Állandó, interaktív **Toast visszaigazolások** (`Sonner` + `MutationCache`) minden művelethez akciógombokkal.
   - **1-kattintásos Sztornó (Beléptetés és Fizetés visszavonás)** és **1-kattintásos Bérletmegújítás** (utolsó alkalom vagy lejárat esetén).
   - **Offline Olvasási Puffer (`Optimistic Offline Scan Queue`):** internet-mikroszakadás esetén a beolvasások mentése és automatikus, idempotens szinkronizálása.
2. **Vendégkartoték és Digitális Kártya (`/guests`):**
   - Vendég regisztráció, bérlettörténet, felhasználási napló (`PassUsageLog`).
   - Kliensoldali **Digitális Belépőkártya Generátor** (Code-128 vonalkód + QR-kód, PNG letöltés és nyomtatás).
   - Admin **Bérlet Hosszabbítás (`+N` nap)** és **Bérlet Fagyasztás / Feloldás** automatikus lejárat-korrekcióval.
3. **Dual-Mode Valós Idejű Vendégmonitor (`/monitor`):**
   - Üzemeltethető a recepciós PC másodlagos kijelzőjén (`BroadcastChannel` + `Socket.io`) vagy önálló Tableten 6 jegyű párosító kóddal (`DisplayDevice` token).
   - `Screen Wake Lock` támogatás az automatikus képernyő-elalvás ellen.
4. **Interaktív Demo & Sandbox Oldal (`/demo`):**
   - Különálló, élő adatbázistól független tesztkörnyezet virtuális vonalkódolvasó szimulátorral, beágyazott élő Vendégmonitor előnézettel és minden funkció kipróbálásával.

## Dokumentációk

- [Technikai Architektúra (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md)
- [Fejlesztési Napló (`docs/DEVELOPMENT_LOG.md`)](docs/DEVELOPMENT_LOG.md)
- [Telepítési és Üzemeltetési Útmutató (`docs/INSTALLATION_GUIDE.md`)](docs/INSTALLATION_GUIDE.md)
- [Felhasználói Kézikönyv (`docs/USER_GUIDE.md`)](docs/USER_GUIDE.md)
- [Fejlesztési Munkafolyamat — Koordinátor + Worker szálak (`docs/WORKFLOW.md`)](docs/WORKFLOW.md)
