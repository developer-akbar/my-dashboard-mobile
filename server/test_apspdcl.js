const serviceNumber = "2323335003064";
fetch(`https://apspdcl.in/ConsumerDashboard/public/publicbillhistory`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
  body: new URLSearchParams({ uscno: String(serviceNumber) }).toString(),
})
.then(r => r.text())
.then(console.log)
.catch(console.error);