// LIVE APPS SCRIPT WEB APP API ENDPOINTS
const QUIZ_CONFIG_API = "https://script.google.com/macros/s/AKfycby--vqW591vmM2XMunDZ5A7EDt4_Ly835x04KlEMIIaxQIGN5wP60uLQay7x_LMRUY2/exec";
const SUBMISSION_API  = "https://script.google.com/macros/s/AKfycbwgwRGCK39qClOdQY0_xWUlWrfJrE4C4K2F8givwR74Rq7kGoECuZODedsNm6X8pnsb/exec";

let quizData = [];
let userAnswers = {};
let currentQuestionIndex = 0;
let violationCount = 0;
let penaltyTimerInterval = null;
let examTimerInterval = null;
let candidateDetails = {};
let examDurationMinutes = 20;

const formFields = ['candidateName', 'collegeName', 'yearOfStudy', 'emailId', 'whatsappNo'];

function initApp() {
    loadSavedFormData();
    fetchQuizConfigAndQuestions();
    setupAntiCheatingListeners();
}

function loadSavedFormData() {
    formFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            const val = localStorage.getItem(fieldId);
            if (val) el.value = val;
            el.addEventListener('input', (e) => {
                localStorage.setItem(fieldId, e.target.value);
            });
        }
    });
}

function fetchQuizConfigAndQuestions() {
    fetch(QUIZ_CONFIG_API)
        .then(res => res.json())
        .then(data => handlePortalInit(data))
        .catch(err => {
            console.error("Error loading quiz configuration:", err);
            alert("Unable to fetch quiz details. Please check your internet connection or try again later.");
        });
}

function handlePortalInit(data) {
    if (data.status === "CLOSED") {
        if(document.getElementById('registrationView')) document.getElementById('registrationView').style.display = 'none';
        if(document.getElementById('closedView')) document.getElementById('closedView').style.display = 'block';
        return;
    }

    quizData = data.questions || [];
    if (data.durationMinutes) examDurationMinutes = data.durationMinutes;

    document.getElementById('scheduledTimeText').innerText = "Scheduled Start: " + (data.startTime || "Now");

    if (data.startTime) {
        const startDateTime = parseDDMMYYYYTime(data.startTime);
        startReverseCountdown(startDateTime);
    } else {
        enableStartButton();
    }
}

function parseDDMMYYYYTime(timeStr) {
    try {
        const [datePart, timePart, ampm] = timeStr.split(' ');
        const [d, m, y] = datePart.split('/').map(Number);
        let [hours, mins] = timePart.split(':').map(Number);
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return new Date(y, m - 1, d, hours, mins, 0);
    } catch(e) {
        return new Date();
    }
}

function enableStartButton() {
    const clockEl = document.getElementById('countdownClock');
    const startBtn = document.getElementById('startExamBtn');
    if (clockEl) {
        clockEl.innerText = "00:00:00";
        clockEl.style.color = "#10b981";
    }
    if (document.getElementById('timerLabel')) document.getElementById('timerLabel').innerText = "Exam Status: Live!";
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Exam Now';
    }
}

function startReverseCountdown(targetDate) {
    const clockEl = document.getElementById('countdownClock');

    function updateClock() {
        const now = new Date();
        const diff = targetDate - now;

        if (diff <= 0) {
            enableStartButton();
            return;
        }

        const hrs = Math.floor(diff / (1000 * 60 * 60)).toString().padStart(2, '0');
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
        const secs = Math.floor((diff % (1000 * 60)) / 1000).toString().padStart(2, '0');
        if (clockEl) clockEl.innerText = `${hrs}:${mins}:${secs}`;
        setTimeout(updateClock, 1000);
    }
    updateClock();
}

function initiateExam() {
    const name = document.getElementById('candidateName').value.trim();
    const college = document.getElementById('collegeName').value.trim();
    const year = document.getElementById('yearOfStudy').value;
    const email = document.getElementById('emailId').value.trim();
    const phone = document.getElementById('whatsappNo').value.trim();

    if (!name || !college || !year || !email || !phone) {
        alert("Please complete all registration details before starting!");
        return;
    }

    const startBtn = document.getElementById('startExamBtn');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerText = "Verifying details...";
    }

    // Checking if candidate has already submitted
    const checkUrl = `${SUBMISSION_API}?action=checkCandidate&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&college=${encodeURIComponent(college)}`;

    fetch(checkUrl)
        .then(res => res.json())
        .then(resData => {
            if (resData.alreadyGiven) {
                alert("You have already submitted this test! Multiple attempts are not allowed.");
                if (startBtn) {
                    startBtn.disabled = false;
                    startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Exam Now';
                }
                return;
            }

            // Continue to start exam if not given earlier
            candidateDetails = { name, college, year, email, phone };
            document.getElementById('activeCandidateTag').innerText = `Candidate: ${name}`;

            requestFullScreen();

            document.getElementById('registrationView').style.display = 'none';
            document.getElementById('examView').style.display = 'block';

            renderQuestion(0);
            startExamTimer(examDurationMinutes * 60);
        })
        .catch(err => {
            console.error("Verification error:", err);
            // Error आला तरी सुरक्षिततेसाठी टेस्ट सुरु करू द्यायची असल्यास:
            candidateDetails = { name, college, year, email, phone };
            document.getElementById('activeCandidateTag').innerText = `Candidate: ${name}`;

            requestFullScreen();

            document.getElementById('registrationView').style.display = 'none';
            document.getElementById('examView').style.display = 'block';

            renderQuestion(0);
            startExamTimer(examDurationMinutes * 60);
        });
}

function requestFullScreen() {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen();
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
}

function renderQuestion(index) {
    currentQuestionIndex = index;
    const q = quizData[index];

    document.getElementById('questionCounter').innerText = `Question ${index + 1} of ${quizData.length}`;
    document.getElementById('questionText').innerText = q.question;

    const container = document.getElementById('optionsContainer');
    container.innerHTML = '';

    const options = [
        { key: 'A', text: q.optionA },
        { key: 'B', text: q.optionB },
        { key: 'C', text: q.optionC },
        { key: 'D', text: q.optionD }
    ];

    options.forEach(opt => {
        const div = document.createElement('div');
        div.className = `option-item ${userAnswers[q.id] === opt.key ? 'selected' : ''}`;
        div.onclick = () => selectOption(q.id, opt.key);
        div.innerHTML = `
            <div class="option-badge">${opt.key}</div>
            <div style="font-size: 0.98rem; font-weight: 600; color: #334155;">${opt.text}</div>
        `;
        container.appendChild(div);
    });

    document.getElementById('prevBtn').disabled = (index === 0);
    document.getElementById('nextBtn').style.display = (index === quizData.length - 1) ? 'none' : 'inline-flex';
    document.getElementById('submitExamBtn').style.display = (index === quizData.length - 1) ? 'inline-flex' : 'none';
}

function selectOption(qId, key) {
    userAnswers[qId] = key;
    renderQuestion(currentQuestionIndex);
}

function navigateQuestion(step) {
    const nextIdx = currentQuestionIndex + step;
    if (nextIdx >= 0 && nextIdx < quizData.length) {
        renderQuestion(nextIdx);
    }
}

function startExamTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('testRemainingTimer');

    examTimerInterval = setInterval(() => {
        remaining--;
        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        if (timerEl) timerEl.innerText = `${m}:${s}`;

        if (remaining <= 0) {
            clearInterval(examTimerInterval);
            alert("Time's up! Submitting your test automatically.");
            submitExam();
        }
    }, 1000);
}

function setupAntiCheatingListeners() {
    window.addEventListener('blur', () => {
        if (document.getElementById('examView') && document.getElementById('examView').style.display === 'block') {
            triggerSecurityViolation("Tab switch or application minimize detected!");
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && document.getElementById('examView') && document.getElementById('examView').style.display === 'block') {
            triggerSecurityViolation("Full-screen mode exited!");
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'PrintScreen' && document.getElementById('examView') && document.getElementById('examView').style.display === 'block') {
            navigator.clipboard.writeText('');
            triggerSecurityViolation("Screenshot attempt detected! Don't take screenshot, our AI surveillance system is actively supervising the exam.");
        }
    });
}

function triggerSecurityViolation(message) {
    violationCount++;
    document.getElementById('violationCountTag').innerText = violationCount;
    document.getElementById('warningMsg').innerText = message;

    if (violationCount > 3) {
        activatePenaltyLockout();
    } else {
        document.getElementById('warningModal').classList.add('active');
    }
}

function dismissWarning() {
    document.getElementById('warningModal').classList.remove('active');
    requestFullScreen();
}

function activatePenaltyLockout() {
    document.getElementById('warningModal').classList.remove('active');
    document.getElementById('penaltyModal').classList.add('active');

    let penaltySeconds = 60;
    const clockEl = document.getElementById('penaltyClock');

    penaltyTimerInterval = setInterval(() => {
        penaltySeconds--;
        const s = penaltySeconds.toString().padStart(2, '0');
        if (clockEl) clockEl.innerText = `00:${s}`;

        if (penaltySeconds <= 0) {
            clearInterval(penaltyTimerInterval);
            document.getElementById('penaltyModal').classList.remove('active');
            violationCount = 0;
            requestFullScreen();
        }
    }, 1000);
}

function submitExam() {
    clearInterval(examTimerInterval);

    let correct = 0;
    quizData.forEach(q => {
        if (userAnswers[q.id] === q.answer) correct++;
    });

    const scoreText = `${correct} / ${quizData.length}`;
    const percentage = Math.round((correct / quizData.length) * 100);

    document.getElementById('displayScore').innerText = scoreText;
    document.getElementById('scorePercentage').innerText = `${percentage}% Marks Obtained`;

    document.getElementById('examView').style.display = 'none';
    document.getElementById('resultView').style.display = 'block';

    const payload = {
        candidateName: candidateDetails.name,
        collegeName: candidateDetails.college,
        yearOfStudy: candidateDetails.year,
        emailId: candidateDetails.email,
        whatsappNo: candidateDetails.phone,
        score: correct,
        totalQuestions: quizData.length,
        percentage: percentage,
        timestamp: new Date().toISOString()
    };

    fetch(SUBMISSION_API, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(() => {
        console.log("Submission successfully sent to Google Sheet API");
    }).catch(err => {
        console.error("Error submitting quiz results:", err);
    });
}
