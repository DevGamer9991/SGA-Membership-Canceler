const cheerio = require("cheerio")
const readline = require('readline');
const fs = require('fs');

process.loadEnvFile(".env")

const cookie = process.env.COOKIE

async function parseActivities(html) {
  const $ = cheerio.load(html);
  const rows = $("#t2 tr");
  const activities = [];

  rows.each((_, el) => {
    const row = $(el);
    const data = row.data();
    const tds = row.find("td").map((_, td) => $(td).text().trim()).get();

    const productName = data.productname || tds[1] || "";
    const activityCode = data.activitycode || "";
    const memberName = data.membername || tds[0] || "";

    const isMembership =
      /membership/i.test(productName) || /membership/i.test(activityCode);

    const isPickleball =
      /thurman/i.test(productName) || /thurman/i.test(activityCode);

    const activity = {
      registrationId: data.registrationid,
      memberId: data.memberid,
      familyId: data.familyid,
      memberName,
      productName,
      activityCode,
      isActive: row.hasClass("Active"),
      isRecurring: row.hasClass("IsRecurring"),
      canCancel: row.hasClass("CanCancel"),
      isMembership,
      isPickleball
    };

    activities.push(activity);
  });

  return activities;
}

async function getMemberActivity(id) {
  const response = await fetch(`https://ymcaokcstaff.sgasoftware.com/Sales/MemberActivity?MemberID=${id}`, {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "max-age=0",
      "priority": "u=0, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "cookie": cookie
    },
    "body": null,
    "method": "GET"
  });

  return await response.text()
}

async function cancelMembership(memberID, familyID, registrationID) {

  const today = new Date();

  const formattedDate = today.toISOString().split('T')[0];

  const response = await fetch(`https://ymcaokcstaff.sgasoftware.com/Sales/MemberActivity/PickCancellationReason?MemberID=${memberID}&FamilyID=${familyID}&RegistrationIDs=${registrationID}&CancellationID=239&CancellationDate=2025-10-17&CancelActivity=2`, {
    "headers": {
      "accept": "text/html, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-requested-with": "XMLHttpRequest",
      "cookie": cookie,
      "Referer": "https://ymcaokcstaff.sgasoftware.com/Sales/MemberActivity?MemberID=6462228"
    },
    "body": `MemberID=${memberID}&FamilyID=${familyID}&RegistrationIDs=${registrationID}&CancellationID=239&CancellationDate=${formattedDate}&CancelActivity=2`,
    "method": "POST"
  });

  return await response.text();
}

async function parseCSV(filePath, delimiter = ',') {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) return reject(err);

      const lines = data.trim().split('\n');
      const headers = lines[0].split(delimiter).map(h => h.trim());

      const rows = lines.slice(1).map(line => {
        const values = line.split(delimiter).map(v => v.trim());
        const entry = {};
        headers.forEach((header, i) => {
          entry[header] = values[i] ?? '';
        });
        return entry;
      });

      resolve(rows);
    });
  });
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }))
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  try {
    const records = await parseCSV('./data.csv');
    const startMemberId = await askQuestion("Enter the member ID to start from: ");
    const endMemberId = await askQuestion("Enter the member ID to end from: ");
    let startProcessing = false;

    for (const record of records) {
      if (!startProcessing && record["Member ID"] === startMemberId) {
        startProcessing = true;
      }

      if (startProcessing && record["Member ID"] === endMemberId) {
        startProcessing = false;
      }

      if (startProcessing) {
        if (record["Member ID"] !== "") {
          const newRecord = record["Member ID"].split("-");
          const memberId = newRecord[0];
          const familyId = newRecord[1];

          console.log(`Processing member ID: ${memberId}-${familyId}`);

          const memberRecord = await getMemberActivity(memberId);

          const activities = await parseActivities(memberRecord);

          const memberships = activities.filter(a => a.isMembership);
          const pickleballAddons = activities.filter(a => a.isPickleball);

          for (const membership of memberships) {
            if (membership.familyId != familyId) continue;

            if (membership.isActive) {
              // await cancelMembership(memberId, familyId, membership.fields.registrationId);

              console.log(`Membership canceled: ${memberId}-${familyId}`);
            } else {
              console.log(`Membership For Member:"${memberId}-${familyId} Not Active, Not Canceling`)
            }
          }

          // for (const pickleball of pickleballAddons) {
          //   if (pickleball.isActive) {
          //     await cancelMembership(memberId, familyId, membership.fields.registrationId);

          //     console.log(`Pickleball Addon Canceled: ${memberId}`);
          //   } else {
          //     console.log(`Pickleball Addon For Member: "${memberId}" Not Active, Not Canceling`)
          //   }
          // }

          await wait(600)
          // break;
        }
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
})();