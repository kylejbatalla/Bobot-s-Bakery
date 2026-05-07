/**
 * Bobot's Bakery — Google Apps Script
 * Receives order submissions from the website, writes them to a Google Sheet,
 * and (if the customer provided an email) sends them a plain-text receipt.
 *
 * SETUP (one time, ~5 minutes):
 *   1. Create a new Google Sheet (e.g. "Bobot's Orders")
 *   2. Note the sheet tab name at the bottom (default is "Sheet1")
 *   3. From the menu: Extensions → Apps Script
 *   4. Delete any existing code, then paste THIS ENTIRE FILE
 *   5. If your tab is not named "Sheet1", change SHEET_NAME below
 *   6. Click the disk/Save icon
 *   7. Click Deploy → New deployment
 *        - Type:    Web app
 *        - Execute as:  Me
 *        - Who has access:  Anyone
 *        - Click Deploy
 *   8. Authorize when prompted. You'll see scopes for both Sheets AND Gmail
 *      (the Gmail scope is needed to send receipts). Click "Advanced" →
 *      "Go to project (unsafe)" → Allow.
 *   9. Copy the "Web app URL" it gives you
 *  10. In your website, open config.js and paste the URL between the quotes
 *
 * NOTE: If you ever change this code, you must Deploy → Manage deployments →
 * pencil icon → Version: New version → Deploy. The URL stays the same.
 * If you've added new scopes (like Gmail), you'll be re-prompted to authorize.
 */

const SHEET_NAME = "Sheet1";  // change if your tab has a different name

// Sender display name for the receipt email (your Gmail address is the actual sender).
const BAKERY_NAME = "Bobot's Bakery";

// Set to false if you ever want to disable receipt emails without redeploying.
const SEND_RECEIPTS = true;

const HEADERS = [
  "Timestamp",
  "Name",
  "Phone",
  "Email",
  "Pickup Date",
  "Payment",
  "Plain Pandesal (dz)",
  "Ube Pandesal (dz)",
  "Pandan Pandesal (dz)",
  "Ube w/ Cheese Pandesal (dz)",
  "Spanish Bread (dz)",
  "Spanish Bread (6pcs)",
  "Plain Ensaymada (4pcs)",
  "Ube & Cheese Ensaymada (4pcs)",
  "Pan de Coco (dz)",
  "Pan de Coco (6pcs)",
  "Malunggay Pandesal (dz)",
  "Total ($)",
  "Notes",
  "Status"
];

// Item key → human-readable name + price + unit (used for sheet column order
// AND for building the receipt email)
const ITEMS = [
  { key: "plain_pandesal_dz",       name: "Plain Pandesal",            price: 8,  unit: "dozen" },
  { key: "ube_pandesal_dz",         name: "Ube Pandesal",              price: 8,  unit: "dozen" },
  { key: "pandan_pandesal_dz",      name: "Pandan Pandesal",           price: 8,  unit: "dozen" },
  { key: "ube_cheese_pandesal_dz",  name: "Ube Pandesal w/ Cheese",    price: 10, unit: "dozen" },
  { key: "spanish_bread_dz",        name: "Spanish Bread",             price: 15, unit: "dozen" },
  { key: "spanish_bread_6",         name: "Spanish Bread",             price: 8,  unit: "6 pcs" },
  { key: "plain_ensaymada_4",       name: "Plain Ensaymada",           price: 8,  unit: "4 pcs" },
  { key: "ube_cheese_ensaymada_4",  name: "Ube & Cheese Ensaymada",    price: 10, unit: "4 pcs" },
  { key: "pan_de_coco_dz",          name: "Pan de Coco",               price: 15, unit: "dozen" },
  { key: "pan_de_coco_6",           name: "Pan de Coco",               price: 8,  unit: "6 pcs" },
  { key: "malunggay_pandesal_dz",   name: "Malunggay Pandesal",        price: 10, unit: "dozen" }
];

/**
 * RUN THIS ONCE from the editor before deploying with email enabled.
 *   1. In the Apps Script editor, click the function dropdown at the top
 *      (next to the "Debug" button) and choose "testAuth"
 *   2. Click the "Run" button (▶)
 *   3. Google will ask you to authorize. The scope list will include both
 *      "See, edit, create, and delete your spreadsheets in Google Drive"
 *      AND "Send email as you" — make sure to approve both.
 *   4. Once you see "Execution completed" in the console, you're good.
 *      Now redeploy: Deploy → Manage deployments → pencil → New version → Deploy.
 *
 * If you ever change scopes in the future, run this again to re-authorize.
 */
function testAuth() {
  SpreadsheetApp.getActiveSpreadsheet();      // requires Sheets scope
  const quota = MailApp.getRemainingDailyQuota(); // requires Gmail send scope
  Logger.log("Auth OK. Remaining mail quota today: " + quota);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet_();

    // Build the row matching HEADERS order
    const items = data.items || {};
    const row = [
      new Date(),
      data.name || "",
      data.phone || "",
      data.email || "",
      data.pickupDate || "",
      data.payment || "",
      ...ITEMS.map(i => items[i.key] || 0),
      Number(data.total || 0),
      data.notes || "",
      "New"
    ];

    sheet.appendRow(row);

    // Send a plain-text receipt if the customer provided an email
    let emailStatus = "skipped";
    let emailError = null;
    let emailQuota = null;
    if (SEND_RECEIPTS && data.email && /\S+@\S+\.\S+/.test(data.email)) {
      try {
        sendReceipt_(data);
        emailStatus = "sent";
        try { emailQuota = MailApp.getRemainingDailyQuota(); } catch (_) { /* quota optional */ }
      } catch (mailErr) {
        emailStatus = "failed";
        emailError = String(mailErr);
        Logger.log("Receipt email failed: " + mailErr);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, emailStatus: emailStatus, emailError: emailError, dailyMailQuota: emailQuota }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput(BAKERY_NAME + " order endpoint is live.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Builds and sends the plain-text receipt email.
 */
function sendReceipt_(data) {
  const items = data.items || {};
  const lines = [];

  lines.push("Hi " + (data.name || "there") + ",");
  lines.push("");
  lines.push("Salamat for your order at " + BAKERY_NAME + "!");
  lines.push("We've received your request and will reach out to confirm pickup details.");
  lines.push("");
  lines.push("--------------------------------------------------");
  lines.push("YOUR ORDER");
  lines.push("--------------------------------------------------");

  let computedTotal = 0;
  ITEMS.forEach(it => {
    const qty = Number(items[it.key] || 0);
    if (qty > 0) {
      const subtotal = qty * it.price;
      computedTotal += subtotal;
      // Pad name to ~36 chars for clean alignment in monospace email clients
      const lineItem = padRight_(it.name + " (" + it.unit + ")", 36) +
                       " " + qty + " x $" + it.price +
                       "  =  $" + subtotal;
      lines.push("  " + lineItem);
    }
  });

  lines.push("--------------------------------------------------");
  lines.push("  " + padRight_("TOTAL", 36) + "         $" + computedTotal);
  lines.push("");

  lines.push("PICKUP");
  lines.push("  DATE:  " + (data.pickupDate || "—"));
  lines.push("  TIME:  12:00PST or later");
  lines.push("");

  lines.push("PAYMENT");
  lines.push("  Method: " + (data.payment || "—"));
  lines.push("");
  lines.push("  ZELLE: 831-261-6136 (Normita Batalla)");
  lines.push("  VENMO: @wtfisupkyle");
  lines.push("  CASH: USD only");
  lines.push("  (Payment is due upon pickup. Large orders may require prepayment —");
  lines.push("   we'll let you know if that applies to your order.)");
  lines.push("");

  lines.push("PICKUP ADDRESS");
  lines.push("  ADDRESS: 753 Atherton Circle Salinas, Ca 93906");
  lines.push("");

  if (data.notes && String(data.notes).trim()) {
    lines.push("YOUR NOTES");
    lines.push("  " + String(data.notes).trim().replace(/\n/g, "\n  "));
    lines.push("");
  }

  lines.push("CONTACT");
  lines.push("  Name:  " + (data.name || ""));
  lines.push("  Phone: " + (data.phone || ""));
  lines.push("");

  lines.push("--------------------------------------------------");
  lines.push("Questions? Reply to this email or message us:");
  lines.push("  Marnold Batalla   (831) 320-8673");
  lines.push("  Normita Batalla   (831) 261-6136");
  lines.push("");
  lines.push("Salamat,");
  lines.push(BAKERY_NAME);
  lines.push("homemade, baked fresh");

  const body = lines.join("\n");

  MailApp.sendEmail({
    to: data.email,
    subject: "Your order request — " + BAKERY_NAME,
    body: body,
    name: BAKERY_NAME
  });
}

function padRight_(s, n) {
  s = String(s);
  while (s.length < n) s += " ";
  return s;
}
