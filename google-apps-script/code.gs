/**
 * Land Management System - Google Sheets Database Script
 * 
 * এই কোডটি আপনার গুগল শিটের 'Extensions' > 'Apps Script' এ গিয়ে পেস্ট করুন।
 * এটি আপনার শিটকে অটোমেটিক ফরম্যাট করবে এবং ডাটাবেস হিসেবে কাজ করতে সাহায্য করবে।
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('LandPro Admin')
      .addItem('শিট ফরম্যাট করুন', 'formatSheet')
      .addItem('রিপোর্ট জেনারেট করুন', 'generateReport')
      .addToUi();
}

/**
 * শিটের হেডার এবং ডিজাইন ঠিক করার জন্য
 */
function formatSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var headers = ["Name", "Phone", "Address", "Area", "Validity Date", "Status"];
  
  // হেডার সেট করা
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
       .setBackground('#1e293b') // Dark Slate
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');
       
  // রো ফ্রিজ করা
  sheet.setFrozenRows(1);
  
  // কলামের সাইজ অটো ঠিক করা
  sheet.autoResizeColumns(1, headers.length);
  
  // বর্ডার দেওয়া
  sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setBorder(true, true, true, true, true, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
  
  SpreadsheetApp.getUi().alert('শিট সফলভাবে ফরম্যাট করা হয়েছে!');
}

/**
 * ওয়েব অ্যাপ হিসেবে ডাটা পড়ার জন্য (GET Request)
 */
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data.shift();
  
  var json = data.map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      obj[header.toLowerCase().replace(/\s+/g, '_')] = row[i];
    });
    return obj;
  });
  
  return ContentService.createTextOutput(JSON.stringify(json))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ওয়েব অ্যাপ হিসেবে ডাটা সেভ করার জন্য (POST Request)
 */
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  if (Array.isArray(data)) {
    data.forEach(function(item) {
      sheet.appendRow([
        item.name,
        item.phone,
        item.address,
        item.area,
        item.validityDate,
        item.status
      ]);
    });
  } else {
    sheet.appendRow([
      data.name,
      data.phone,
      data.address,
      data.area,
      data.validityDate,
      data.status
    ]);
  }
  
  return ContentService.createTextOutput(JSON.stringify({status: "success", message: "Data saved successfully"}))
    .setMimeType(ContentService.MimeType.JSON);
}
