const CONFIG = {
  CLIENT_ID: "39804282924-73f3mgr9ku5tg7jqdshdh52qdhmtri8o.apps.googleusercontent.com",
  SPREADSHEET_ID: "1SfzzmaR4-vxHYUA21qUTEM0wxMLhjjrH2lycMfkKm4o",
  SHEET_RECORDS: "記帳紀錄",
  SHEET_FIELDS: "欄位表",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets"
};

let accessToken = "";
let tokenClient = null;
let currentMonth = "";
let chartInstance = null;
let fieldOptions = { "支出": [], "收入": [] };

const $ = (s) => document.querySelector(s);

// 初始化
(function() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  $("#fDate").value = `${ym}-${String(now.getDate()).padStart(2, "0")}`;
  currentMonth = ym;
  $("#monthPicker").value = ym;
})();

window.onGisLoaded = () => {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (resp) => {
      if (resp.access_token) {
        accessToken = resp.access_token;
        afterSignedIn();
      }
    }
  });
  $("#btnSignIn").disabled = false;
};

async function afterSignedIn() {
  $("#btnSignIn").style.display = "none";
  $("#btnSignOut").disabled = false;
  setControls(true);
  await loadFields();
  updateFormSelects("支出");
  await fetchAndRender();
}

async function loadFields() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEET_FIELDS + "!A:C")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  const rows = data.values || [];

  const options = { "支出": { cats: new Set(), pays: new Set() }, "收入": { cats: new Set(), pays: new Set() } };
  rows.slice(1).forEach(r => {
    const types = (r[0] === "支出" || r[0] === "收入") ? [r[0]] : ["支出", "收入"];
    types.forEach(t => {
      if(r[1]) options[t].cats.add(r[1]);
      if(r[2]) options[t].pays.add(r[2]);
    });
  });
  fieldOptions = options;
}

function updateFormSelects(type) {
  const data = fieldOptions[type];
  $("#fCategory").innerHTML = Array.from(data.cats).map(c => `<option value="${c}">${c}</option>`).join("");
  $("#fPayment").innerHTML = Array.from(data.pays).map(p => `<option value="${p}">${p}</option>`).join("");
}

async function fetchAndRender() {
  setStatus("🔄 同步中...", false);
  try {
    const range = `${CONFIG.SHEET_RECORDS}!A:G`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    
    const records = (data.values || []).slice(1).map(r => ({
      date: r[1], type: r[2], cat: r[3], amt: Number(r[4]), desc: r[5], pay: r[6]
    })).filter(r => r.date && r.date.startsWith(currentMonth));

    renderStats(records);
    renderTable(records);
    renderChart(records.filter(r => r.type === "支出"));
    setStatus(`✅ 已更新 (${currentMonth})`, false);
  } catch (e) { setStatus("❌ 同步失敗", true); }
}

function renderChart(expenses) {
  const ctx = $("#categoryChart").getContext("2d");
  const cats = {};
  expenses.forEach(r => cats[r.cat] = (cats[r.cat] || 0) + r.amt);
  
  const labels = Object.keys(cats);
  const vals = Object.values(cats);

  if (chartInstance) chartInstance.destroy();
  if (labels.length === 0) return;

  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: vals,
        backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4'],
        borderWidth: 0
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '75%' }
  });

  $("#categoryLegend").innerHTML = labels.map((l, i) => `
    <div class="row center gap">
      <span style="width:8px; height:8px; border-radius:50%; background:${chartInstance.data.datasets[0].backgroundColor[i]}"></span>
      <span class="muted">${l}:</span> <span>${vals[i].toLocaleString()}</span>
    </div>`).join("");
}

function renderStats(records) {
  const inc = records.filter(r => r.type === "收入").reduce((s, r) => s + r.amt, 0);
  const exp = records.filter(r => r.type === "支出").reduce((s, r) => s + r.amt, 0);
  $("#sumIncome").textContent = inc.toLocaleString();
  $("#sumExpense").textContent = exp.toLocaleString();
  $("#sumNet").textContent = (inc - exp).toLocaleString();
}

function renderTable(records) {
  $("#recordsTbody").innerHTML = records.sort((a,b) => b.date.localeCompare(a.date)).map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.type}</td>
      <td>${r.cat}</td>
      <td class="right ${r.type==='支出'?'danger':'success'}">${r.amt.toLocaleString()}</td>
      <td>${r.desc}</td>
      <td>${r.pay}</td>
    </tr>`).join("");
}

// 事件
$("#fType").onchange = (e) => updateFormSelects(e.target.value);
$("#monthPicker").onchange = (e) => { currentMonth = e.target.value; fetchAndRender(); };
$("#btnSignIn").onclick = () => tokenClient.requestAccessToken({ prompt: 'consent' });
$("#btnReload").onclick = fetchAndRender;
$("#btnRefresh").onclick = fetchAndRender;

$("#recordForm").onsubmit = async (e) => {
  e.preventDefault();
  const row = [Date.now(), $("#fDate").value, $("#fType").value, $("#fCategory").value, Number($("#fAmount").value), $("#fDescription").value, $("#fPayment").value];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEET_RECORDS + "!A:G")}:append?valueInputOption=USER_ENTERED`;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [row] })
  });
  $("#fAmount").value = ""; $("#fDescription").value = "";
  fetchAndRender();
};

function setStatus(m, err) { const s = $("#status"); s.textContent = m; s.style.color = err ? "var(--danger)" : "var(--primary)"; }
function setControls(en) { ["#btnReload", "#btnRefresh", "#btnSubmit", "#monthPicker"].forEach(id => $(id).disabled = !en); }