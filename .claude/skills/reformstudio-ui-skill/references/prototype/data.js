// Mintaadatok a bemutatóhoz
const TODAY = new Date();
const addDays = n => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return d; };

const PERMISSIONS = [
  { key: "checkin", label: "Kézi beléptetés és kiléptetés" },
  { key: "book", label: "Órára foglalás vendég nevében" },
  { key: "sell", label: "Bérlet és termék értékesítése" },
  { key: "extend", label: "Bérlet hosszabbítása" },
  { key: "members", label: "Vendégadatok szerkesztése" },
  { key: "prices", label: "Árak és termékek módosítása" },
  { key: "schedule", label: "Órarend szerkesztése" },
  { key: "users", label: "Felhasználók kezelése" },
  { key: "roles", label: "Szerepkörök és jogok kezelése" }
];

let ROLES = [
  { id: "admin", name: "Admin", desc: "Teljes hozzáférés, nem korlátozható", locked: true,
    perms: PERMISSIONS.map(p => p.key) },
  { id: "recep", name: "Recepciós", desc: "Napi pultkezelés és értékesítés",
    perms: ["checkin", "book", "sell", "extend", "members"] },
  { id: "coach", name: "Edző", desc: "Saját órák és résztvevők",
    perms: ["book"] }
];

let STAFF = [
  { id: 1, name: "Kelemen Anna", email: "anna.kelemen@reformstudio.hu", role: "admin", active: true, last: "Ma, 07:42" },
  { id: 2, name: "Fekete Bálint", email: "balint.fekete@reformstudio.hu", role: "recep", active: true, last: "Ma, 13:58" },
  { id: 3, name: "Lukács Dóra", email: "dora.lukacs@reformstudio.hu", role: "recep", active: true, last: "Tegnap, 20:11" },
  { id: 4, name: "Papp Réka", email: "reka.papp@reformstudio.hu", role: "coach", active: true, last: "Ma, 06:50" },
  { id: 5, name: "Simon Ádám", email: "adam.simon@reformstudio.hu", role: "coach", active: false, last: "Okt. 12." }
];

let PRODUCTS = [
  { id: "p8", name: "8 alkalmas Reformer", desc: "8 óra, 45 napig érvényes", price: 52000, days: 45, occ: 8 },
  { id: "p4", name: "4 alkalmas Reformer", desc: "4 óra, 30 napig érvényes", price: 28000, days: 30, occ: 4 },
  { id: "pm", name: "Havi korlátlan", desc: "Korlátlan óra 30 napig", price: 64900, days: 30, occ: null },
  { id: "p1", name: "Egyszeri belépő", desc: "1 óra, aznap érvényes", price: 7900, days: 1, occ: 1 },
  { id: "pmat", name: "10 alkalmas Mat", desc: "Csak Mat Pilates és Barre", price: 34000, days: 60, occ: 10 },
  { id: "ppt", name: "Privát óra 1:1", desc: "Kiegészítő, edzővel egyeztetve", price: 18500, days: 60, occ: 1, addon: true }
];

let CLASSES = [
  { id: "c1", t: "07:00", n: "Reformer Alap", coach: "Papp Réka", room: "Reformer terem 1", cap: 8, booked: 8 },
  { id: "c2", t: "09:00", n: "Reformer Haladó", coach: "Papp Réka", room: "Reformer terem 1", cap: 8, booked: 6 },
  { id: "c3", t: "12:00", n: "Mat Pilates", coach: "Simon Ádám", room: "Mat terem", cap: 14, booked: 9 },
  { id: "c4", t: "16:30", n: "Reformer Alap", coach: "Papp Réka", room: "Reformer terem 2", cap: 8, booked: 7 },
  { id: "c5", t: "17:30", n: "Reformer Jump", coach: "Papp Réka", room: "Reformer terem 1", cap: 8, booked: 8 },
  { id: "c6", t: "18:30", n: "Barre", coach: "Simon Ádám", room: "Mat terem", cap: 14, booked: 11 },
  { id: "c7", t: "19:30", n: "Reformer Stretch", coach: "Papp Réka", room: "Reformer terem 2", cap: 8, booked: 4 }
];

let MEMBERS = [
  { id: 1, name: "Nagy Eszter", card: "RS-04821", phone: "+36 30 412 8831", email: "eszter.nagy@gmail.com", pass: "8 alkalmas Reformer", total: 8, left: 5, until: addDays(19), cls: "c4", since: "2024. márc.",
    visits: [["Nov. 5.", "Reformer Alap"], ["Nov. 3.", "Reformer Alap"], ["Okt. 31.", "Barre"]], buys: [["Okt. 22.", "8 alkalmas Reformer", 52000]] },
  { id: 2, name: "Kovács Dániel", card: "RS-01173", phone: "+36 20 991 0042", email: "d.kovacs@outlook.com", pass: "4 alkalmas Reformer", total: 4, left: 1, until: addDays(9), cls: "c5", since: "2025. jan.",
    visits: [["Nov. 4.", "Reformer Jump"], ["Okt. 29.", "Reformer Alap"]], buys: [["Okt. 15.", "4 alkalmas Reformer", 28000]] },
  { id: 3, name: "Tóth Lilla", card: "RS-09032", phone: "+36 70 220 5571", email: "lilla.toth@gmail.com", pass: "Havi korlátlan", total: 30, left: null, until: addDays(2), cls: "c6", since: "2023. szept.",
    visits: [["Nov. 6.", "Barre"], ["Nov. 5.", "Reformer Stretch"]], buys: [["Okt. 9.", "Havi korlátlan", 64900]] },
  { id: 4, name: "Szabó Márk", card: "RS-02559", phone: "+36 30 118 6620", email: "mark.szabo@gmail.com", pass: "8 alkalmas Reformer", total: 8, left: 2, until: addDays(-3), cls: "c7", since: "2025. máj.",
    visits: [["Okt. 30.", "Reformer Stretch"]], buys: [["Szept. 19.", "8 alkalmas Reformer", 52000]] },
  { id: 5, name: "Varga Noémi", card: "RS-06647", phone: "+36 20 705 3318", email: "noemi.varga@freemail.hu", pass: "Havi korlátlan", total: 30, left: null, until: addDays(24), cls: "c4", since: "2022. nov.",
    visits: [["Nov. 6.", "Reformer Haladó"], ["Nov. 4.", "Barre"], ["Nov. 2.", "Reformer Alap"]], buys: [["Nov. 1.", "Havi korlátlan", 64900]] },
  { id: 6, name: "Horváth Gergő", card: "RS-03884", phone: "+36 70 640 1290", email: "gergo.h@gmail.com", pass: "4 alkalmas Reformer", total: 4, left: 0, until: addDays(14), cls: "c7", since: "2025. aug.",
    visits: [["Nov. 5.", "Reformer Alap"]], buys: [["Okt. 22.", "4 alkalmas Reformer", 28000]] },
  { id: 7, name: "Kiss Petra", card: "RS-07402", phone: "+36 30 556 7712", email: "petra.kiss@gmail.com", pass: "10 alkalmas Mat", total: 10, left: 7, until: addDays(41), cls: "c6", since: "2024. jún.",
    visits: [["Nov. 4.", "Mat Pilates"]], buys: [["Okt. 27.", "10 alkalmas Mat", 34000]] },
  { id: 8, name: "Molnár Ákos", card: "RS-08115", phone: "+36 20 333 4180", email: "akos.molnar@gmail.com", pass: "8 alkalmas Reformer", total: 8, left: 6, until: addDays(33), cls: "c5", since: "2025. febr.",
    visits: [["Nov. 6.", "Reformer Haladó"]], buys: [["Nov. 2.", "8 alkalmas Reformer", 52000]] }
];
MEMBERS.forEach(m => { m.inside = false; m.locker = null; });
