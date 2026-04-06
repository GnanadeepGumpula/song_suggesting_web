const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const STUDENTS = [
  { roll: "B22AI001", name: "JAMALAPURAM PRUTHAN" },
  { roll: "B22AI002", name: "PUNNAM RITHVIKA REDDY" },
  { roll: "B22AI003", name: "CHALLAGURUGULA GEETHIKA" },
  { roll: "B22AI004", name: "MADAPATI SAI SRAVANI" },
  { roll: "B22AI005", name: "SINDHUJA THAMMI" },
  { roll: "B22AI006", name: "ANTHAM RAJINI" },
  { roll: "B22AI007", name: "VANGALA YASHWANTH" },
  { roll: "B22AI008", name: "SIDDOJU GOURAV SIDDARTH" },
  { roll: "B22AI009", name: "ADI SAI KIRAN" },
  { roll: "B22AI010", name: "DARBHASAYANAM SHREEYA" },
  { roll: "B22AI011", name: "CHALLA VAAGDEVI" },
  { roll: "B22AI012", name: "BAJJURI MEGHANA" },
  { roll: "B22AI013", name: "SRIRAMULA MAMATHA" },
  { roll: "B22AI014", name: "THATIPELLI SUDIKSHA" },
  { roll: "B22AI015", name: "KASTURI RAMMURTI KAYARWAR" },
  { roll: "B22AI016", name: "ANUMALA SUSHRAI" },
  { roll: "B22AI017", name: "SAGI SAI HARSHITH" },
  { roll: "B22AI018", name: "BANDELA THRISHUNA" },
  { roll: "B22AI019", name: "KODAM ADHVAITH" },
  { roll: "B22AI020", name: "ALETI SATHVIKA" },
  { roll: "B22AI021", name: "DUMPETI PAVANI" },
  { roll: "B22AI022", name: "BRAHMADEVARA SRIVARSHA" },
  { roll: "B22AI023", name: "MOHAMMAD SOHEL" },
  { roll: "B22AI024", name: "NALLA SHREE VANSH" },
  { roll: "B22AI025", name: "DHUDA SATHISH" },
  { roll: "B22AI026", name: "SEETHA SPANDANA" },
  { roll: "B22AI027", name: "KUCHANA SANKRISHNA" },
  { roll: "B22AI028", name: "NANDHANAVENI SAHARSHA" },
  { roll: "B22AI029", name: "AKULA SATHWIKA" },
  { roll: "B22AI030", name: "THUNGANI VINEETH" },
  { roll: "B22AI031", name: "ENDLA AKHIL BALAJI" },
  { roll: "B22AI032", name: "LADE PRASHANTH" },
  { roll: "B22AI033", name: "NAINI NEHA" },
  { roll: "B22AI034", name: "SAMUDRALA PRASHANTHI" },
  { roll: "B22AI035", name: "KONDA VARSHA" },
  { roll: "B22AI036", name: "MUKKA SHRIJANI" },
  { roll: "B22AI037", name: "NASAM SAI GEETHIKA" },
  { roll: "B22AI038", name: "PILLALA VARSHINI" },
  { roll: "B22AI039", name: "RAJANALA SIRI" },
  { roll: "B22AI040", name: "KOLA SINDHU" },
  { roll: "B22AI041", name: "DUSSA PRANAY SAKETH" },
  { roll: "B22AI042", name: "GUMPULA GNANADEEP" },
  { roll: "B22AI043", name: "GANNEBOINA THRIVIK RAJ" },
  { roll: "B22AI044", name: "BETHI ANSH" },
  { roll: "B22AI045", name: "KANDALA AKHILA" },
  { roll: "B22AI046", name: "REEBA MAAYERA" },
  { roll: "B22AI047", name: "MALLU SATHWIKA" },
  { roll: "B22AI048", name: "PASTHAM SUSANNA" },
  { roll: "B22AI049", name: "ALETI KIRAN" },
  { roll: "B22AI050", name: "MATTEPALLY SAI SATHVIK RAJ" },
  { roll: "B22AI051", name: "GINNARAPU STALIN" },
  { roll: "B22AI052", name: "DANDEM ANIRUDH SAI" },
  { roll: "B22AI053", name: "BADDI VAMSHI" },
  { roll: "B22AI054", name: "BYRU VISHWAJITHA" },
  { roll: "B22AI055", name: "BANDAVATH VISHNU" },
  { roll: "B22AI056", name: "MASAM YASHWANTH" },
  { roll: "B22AI057", name: "RAIKANTI VARSHITH KUMAR" },
  { roll: "B22AI058", name: "AMBATI NANDINI" },
  { roll: "B22AI059", name: "YERRA AKSHAY BABU" },
  { roll: "B22AI060", name: "VODAPALLI KOUSHIK" },
  { roll: "B22AI061", name: "YERRA UDHAY" },
  { roll: "B22AI062", name: "JANNU SHRUTHI" },
  { roll: "B22AI063", name: "PALTHYAVATH NANDU" },
  { roll: "B22AI064", name: "BANOTHU ANUSHA" }
];

const SHEET_NAMES = {
  students: "Students",
  songs: "Songs"
};

function getEnv(name, fallback) {
  return process.env[name] || (fallback ? process.env[fallback] : "");
}

function createSheetsClient() {
  const email = getEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKeyRaw = getEnv("GOOGLE_PRIVATE_KEY", "VITE_GOOGLE_PRIVATE_KEY");
  const spreadsheetId = getEnv("GOOGLE_SPREADSHEET_ID", "VITE_GOOGLE_SPREADSHEET_ID");
  const privateKey = privateKeyRaw
    ? privateKeyRaw.replace(/\\n/g, "\n").replace(/^"|"$/g, "")
    : "";

  if (!email || !privateKey || !spreadsheetId) {
    throw new Error("Missing Google Sheets environment values");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return {
    spreadsheetId,
    sheets: google.sheets({ version: "v4", auth })
  };
}

async function ensureSheetExists(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(
    (sheet) => sheet.properties && sheet.properties.title === title
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }]
      }
    });
  }
}

async function main() {
  const { sheets, spreadsheetId } = createSheetsClient();

  await ensureSheetExists(sheets, spreadsheetId, SHEET_NAMES.students);
  await ensureSheetExists(sheets, spreadsheetId, SHEET_NAMES.songs);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_NAMES.students}!A:Z`
  });

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${SHEET_NAMES.songs}!A:Z`
  });

  const studentValues = [
    ["roll", "name"],
    ...STUDENTS.map((item) => [item.roll, item.name])
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAMES.students}!A1:B${studentValues.length}`,
    valueInputOption: "RAW",
    requestBody: {
      values: studentValues
    }
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAMES.songs}!A1:D1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["roll", "title", "image", "songUrl"]]
    }
  });

  console.log(`Seeded ${STUDENTS.length} students into spreadsheet ${spreadsheetId}`);
}

main().catch((error) => {
  console.error("Failed to seed Google Sheet");
  console.error(error.message);
  process.exit(1);
});
