const SUPABASE_URL = "https://ubaebeumhqpeojxxifku.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NLMCqpHbE701xf23IRABbQ_yIvYTPs4";

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let semesters = [];
let currentCourses = [];
let currentUserId = null;

// ---------- INIT ----------

async function init() {
  await signInAnon();
  await loadSemesters();
  showCourses();
  calculateCGPA();
}

// Signs the browser in anonymously so each visitor gets their own
// private set of rows, without needing a login screen.
async function signInAnon() {

  let { data: sessionData } = await _supabase.auth.getSession();

  if (sessionData.session) {
    currentUserId = sessionData.session.user.id;
    return;
  }

  let { data, error } = await _supabase.auth.signInAnonymously();

  if (error) {
    console.error("Auth error:", error.message);
    alert("Could not connect to the database. Check the console.");
    return;
  }

  currentUserId = data.user.id;
}

// ---------- CURRENT (UNSAVED) SEMESTER ----------

function addCourse() {

  let name = document.getElementById("courseName").value;
  let score = document.getElementById("score").value;
  let credit = document.getElementById("credit").value;

  if (name === "" || score === "" || credit === "") {
    alert("Fill all fields");
    return;
  }

  currentCourses.push({
    name: name,
    score: Number(score),
    credit: Number(credit)
  });

  document.getElementById("courseName").value = "";
  document.getElementById("score").value = "";
  document.getElementById("credit").value = "";

  showCourses();
}

function showCourses() {

  let list = document.getElementById("courseList");
  list.innerHTML = "";

  for (let i = 0; i < currentCourses.length; i++) {

    let c = currentCourses[i];
    let gp = getGP(c.score);

    list.innerHTML += `
      <tr>
        <td>${c.name}</td>
        <td>${c.score}</td>
        <td>${gp}</td>
        <td>${c.credit}</td>
        <td>
          <button onclick="deleteCourse(${i})">Delete</button>
        </td>
      </tr>
    `;
  }
}

function deleteCourse(index) {
  currentCourses.splice(index, 1);
  showCourses();
}

function getGP(score) {
  if (score >= 70) return 5.00;
  if (score >= 60) return 4.00;
  if (score >= 50) return 3.00;
  if (score >= 45) return 2.00;
  if (score >= 40) return 1.00;
  if (score >= 0) return 0.00;
  return 0;
}

// ---------- INPUT RESTRICTIONS ----------

const courseNameInput = document.getElementById("courseName");
const scoreInput = document.getElementById("score");
const creditInput = document.getElementById("credit");

// Course code: 3 letters + 3 numbers
courseNameInput.addEventListener("input", function () {
    this.value = this.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
});

// Score: numbers only, maximum 3 digits
scoreInput.addEventListener("input", function () {
    this.value = this.value
        .replace(/\D/g, "")
        .slice(0, 3);

    // Don't allow a score above 100
    if (Number(this.value) > 100) {
        this.value = "100";
    }
});

// Credit unit: numbers only, maximum 1 digit
creditInput.addEventListener("input", function () {
    this.value = this.value
        .replace(/\D/g, "")
        .slice(0, 1);
});

function calculate() {

  let totalQP = 0;
  let totalCredit = 0;

  for (let i = 0; i < currentCourses.length; i++) {

    let c = currentCourses[i];

    let gp = getGP(c.score);
    let qp = gp * c.credit;

    totalQP += qp;
    totalCredit += c.credit;
  }

  if (totalCredit === 0) {
    alert("No courses added");
    return;
  }

  let gpa = totalQP / totalCredit;

  document.getElementById("gpa").innerText = gpa.toFixed(2);
}

// ---------- SAVE SEMESTER TO SUPABASE ----------

async function saveSemester() {

  let totalQP = 0;
  let totalCredit = 0;

  for (let i = 0; i < currentCourses.length; i++) {

    let c = currentCourses[i];

    let gp = getGP(c.score);
    let qp = gp * c.credit;

    totalQP += qp;
    totalCredit += c.credit;
  }

  if (totalCredit === 0) {
    alert("Add courses before saving semester");
    return;
  }

  let gpa = totalQP / totalCredit;

  // 1. Insert the semester row and get its generated id back
  let { data: semesterData, error: semesterError } = await _supabase
    .from("semesters")
    .insert([{
      user_id: currentUserId,
      gpa: gpa,
      total_qp: totalQP,
      total_credit: totalCredit
    }])
    .select()
    .single();

  if (semesterError) {
    console.error("Save semester error:", semesterError.message);
    alert("Could not save semester");
    return;
  }

  // 2. Insert all of this semester's courses, linked by semester_id
  let courseRows = currentCourses.map(function (c) {
    return {
      semester_id: semesterData.id,
      user_id: currentUserId,
      name: c.name,
      score: c.score,
      credit: c.credit,
      grade_point: getGP(c.score)
    };
  });

  let { error: coursesError } = await _supabase
    .from("courses")
    .insert(courseRows);

  if (coursesError) {
    console.error("Save courses error:", coursesError.message);
    alert("Semester saved, but courses failed to save");
  }

  currentCourses = [];
  showCourses();

  await loadSemesters();
  calculateCGPA();

  alert("Semester saved!");
}

// ---------- LOAD SAVED SEMESTERS ----------

async function loadSemesters() {

  let { data, error } = await _supabase
    .from("semesters")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load semesters error:", error.message);
    return;
  }

  semesters = data;
  showSemesterHistory();
}

function showSemesterHistory() {

  let historyEl = document.getElementById("semesterHistory");
  historyEl.innerHTML = "";

  for (let i = 0; i < semesters.length; i++) {

    let s = semesters[i];

    historyEl.innerHTML += `
      <tr>
        <td>Semester ${i + 1}</td>
        <td>${Number(s.gpa).toFixed(2)}</td>
        <td>${s.total_credit}</td>
      </tr>
    `;
  }
}

// ---------- CGPA (across all saved semesters) ----------

function calculateCGPA() {

  let totalQP = 0;
  let totalCredit = 0;

  for (let i = 0; i < semesters.length; i++) {
    totalQP += Number(semesters[i].total_qp);
    totalCredit += Number(semesters[i].total_credit);
  }

  if (totalCredit === 0) {
    document.getElementById("cgpa").innerText = "0.00";
    return;
  }

  let cgpa = totalQP / totalCredit;

  document.getElementById("cgpa").innerText = cgpa.toFixed(2);
}

document.addEventListener("DOMContentLoaded", init);
