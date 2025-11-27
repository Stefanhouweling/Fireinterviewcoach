// ============================================
// FIRE INTERVIEW COACH - MASTER CONFIG FILE
// ============================================
// 
// 📝 HOW TO USE THIS FILE:
//   1. Find the section you want to edit (use Ctrl+F / Cmd+F)
//   2. Change the text between the quotes
//   3. Save the file
//   4. Refresh your browser - changes appear immediately!
//
// 💡 TIP: Use {appName}, {year}, {company} as placeholders
//          They will be automatically replaced!
//
// ============================================

const APP_CONFIG = {
  
  // ============================================
  // 🏢 BASIC APP INFORMATION
  // ============================================
  appName: "Fire Interview Coach",
  appTagline: "AI-Powered Interview Practice for Firefighters",
  copyrightYear: "2025",
  companyName: "Fire Interview CoachAI",
  
  // ============================================
  // 📱 HEADER & NAVIGATION
  // ============================================
  header: {
    title: "Fire Interview Coach",
    subtitle: "AI-Powered Interview Practice"
  },
  
  // ============================================
  // 🔘 BUTTONS - All Button Text
  // ============================================
  buttons: {
    // Main Practice Buttons
    nextQuestion: "🎤 Next Question",
    repeatQuestion: "🔁 Repeat",
    answerQuestion: "🎤 Answer Question",
    finishAnswering: "✅ Finish Answering Question",
    analyzeAnswer: "🤖 Analyze Answer",
    
    // Camera Buttons
    startCamera: "📹 Start Camera",
    stopCamera: "⏹️ Stop Camera",
    
    // Resume Button
    uploadResume: "📄 Upload Resume",
    
    // Feedback & Follow-up
    viewDetailedFeedback: "📖 View Detailed AI Feedback",
    askFollowup: "💬 Ask Follow-up Question",
    
    // Terms & Onboarding
    acceptTerms: "Accept & Continue",
    startPractice: "Start Practice Session"
  },
  
  // ============================================
  // 🎯 PRACTICE MODE OPTIONS
  // ============================================
  practiceMode: {
    interviewSimulation: "Interview Simulation (Random)",
    userSpecific: "User-Specific Practice",
    selectCategory: "Select Category"
  },
  
  // ============================================
  // 📊 STATUS MESSAGES
  // ============================================
  status: {
    micIdle: "Mic idle",
    micListening: "Listening...",
    analyzing: "🤖 Analyzing Your Answer...",
    analyzingResume: "🤖 Analyzing resume with AI...",
    generatingQuestion: "🤖 Generating question...",
    contactingAI: "Contacting AI Interview Coach"
  },
  
  // ============================================
  // 💬 FEEDBACK SECTION TITLES
  // ============================================
  feedback: {
    contentStructure: "Content & Structure",
    voiceFillerWords: "Voice & Filler Words",
    bodyLanguage: "Body Language (Camera)",
    fireSpecificTips: "Fire-Specific Tips / AI Coach",
    feedbackOnAnswer: "Feedback on This Answer"
  },
  
  // ============================================
  // 📖 INSTRUCTIONS & HELP TEXT
  // ============================================
  instructions: {
    welcome: "Welcome to Fire Interview Coach",
    getStarted: "Click <strong>Next Question</strong> to begin. AI will generate personalized questions based on your resume and conversation history.",
    uploadResumePrompt: "Upload your resume to get personalized interview questions",
    cameraInstructions: "Environment: Aim for chest-up framing, neutral background, good light.",
    cameraGoal: "Goal: calm but engaged, limited fidgeting.",
    noResumeLoaded: "No resume loaded yet. Upload a file to get personalized questions based on your experience."
  },
  
  // ============================================
  // 🔔 MODAL TITLES & TEXT
  // ============================================
  modals: {
    aiFeedback: "🤖 AI Interview Coach Feedback",
    termsTitle: "🔥 Welcome to Fire Interview Coach",
    termsSubtitle: "Please review and accept our terms to continue",
    termsImportant: "Important: Fire Interview Coach is a practice tool only and does not guarantee job offers or employment.",
    termsMustAccept: "You must accept the Terms of Service and Privacy Policy to use Fire Interview Coach."
  },
  
  // ============================================
  // ❌ ERROR MESSAGES
  // ============================================
  errors: {
    noTranscript: "No transcript found. Answer the question or type your answer first.",
    analysisFailed: "AI analysis failed.",
    checkConnection: "Check your connection and try again.",
    noFeedback: "AI didn't return any feedback. Please try again."
  },
  
  // ============================================
  // 📝 QUESTION LABELS
  // ============================================
  questionLabels: {
    questionNumber: "Question #{number}",
    mode: "Mode: AI-Powered Dynamic Panel (behavioural + technical + contextual followups)",
    interviewQuestion: "Interview Question"
  },
  
  // ============================================
  // 📄 FOOTER TEXT
  // ============================================
  footer: {
    copyright: "© {year} {company}. All rights reserved.",
    termsLink: "Terms of Service",
    privacyLink: "Privacy Policy",
    disclaimer: "{appName} is a practice tool only and does not guarantee job offers or employment."
  },
  
  // ============================================
  // 🎯 ONBOARDING MODAL - Main Title & Subtitle
  // ============================================
  onboarding: {
    title: "🎯 Let's Get Started",
    subtitle: "Tell us about yourself to personalize your interview practice"
  },
  
  // ============================================
  // 📄 ONBOARDING - Resume Section
  // ============================================
  onboardingResume: {
    label: "1. Upload Resume",
    optional: "(Optional)",
    uploadButtonText: "Upload resume (PDF, DOC, DOCX, TXT, RTF)",
    statusMessages: {
      reading: "Reading resume file...",
      parsing: "Parsing resume with AI...",
      success: "✓ Resume uploaded successfully!",
      error: "✗ Failed to upload resume. You can continue without it.",
      tooLarge: "File is too large. Please use a smaller file or a text version."
    }
  },
  
  // ============================================
  // 📍 ONBOARDING - Location Section
  // ============================================
  onboardingLocation: {
    mainLabel: "2. What City are you applying to?",
    required: "*",
    country: {
      label: "Country",
      placeholder: "Select Country",
      options: {
        empty: "Select Country",
        unitedStates: "United States",
        canada: "Canada",
        unitedKingdom: "United Kingdom",
        australia: "Australia",
        newZealand: "New Zealand",
        other: "Other"
      }
    },
    stateProvince: {
      label: "State/Province",
      placeholder: "Start typing state/province"
    },
    city: {
      label: "City",
      placeholder: "Start typing city name"
    },
    searchMessages: {
      searching: "🤖 Searching cities...",
      searchingStates: "🤖 Searching states...",
      noCitiesFound: "No cities found",
      noStatesFound: "No states found",
      searchUnavailable: "Search unavailable. Try typing manually.",
      cannotConnect: "Cannot connect to server. You can type manually.",
      notAvailable: "Location search not available. Please type manually.",
      searchError: "Search error. Please try again.",
      notConfigured: "Mapbox search not configured"
    }
  },
  
  // ============================================
  // 💼 ONBOARDING - Job Type Section
  // ============================================
  onboardingJobType: {
    label: "3. What are you applying for?",
    required: "*",
    placeholder: "Select Position Type",
    options: {
      fire: "Fire",
      police: "Police",
      paramedic: "Paramedic",
      firstResponder: "First Responder",
      dispatcher: "Dispatcher"
    }
  },
  
  // ============================================
  // 🏛️ ONBOARDING - Department Section
  // ============================================
  onboardingDepartment: {
    label: "4. Department Name",
    required: "*",
    placeholder: "e.g., CoachAI Fire Department",
    helperText: "This will be used to personalize your interview questions"
  },
  
  // ============================================
  // 👤 ONBOARDING - Name Section
  // ============================================
  onboardingName: {
    label: "5. Your Name",
    optional: "(Optional)",
    placeholder: "e.g., John Smith",
    helperText: "AI will address you by name in some questions"
  },
  
  // ============================================
  // 🎤 ONBOARDING - Voice Preference Section
  // ============================================
  onboardingVoice: {
    label: "6. Voice Preference",
    optional: "(Optional)",
    placeholder: "Default (Auto)",
    options: {
      default: "Default (Auto)",
      male: "Male Voice",
      female: "Female Voice"
    },
    helperText: "Choose your preferred voice for question narration"
  },
  
  // ============================================
  // ✅ ONBOARDING - Submit & Footer
  // ============================================
  onboardingSubmit: {
    buttonText: "Start Practice Session",
    requiredFields: "* Required fields"
  },
  
  // ============================================
  // ⚠️ ONBOARDING - Error Messages
  // ============================================
  onboardingErrors: {
    cityRequired: "Please select or enter a city",
    countryRequired: "Please select a country",
    jobTypeRequired: "Please select a position type",
    departmentRequired: "Please enter a department name",
    formIncomplete: "Please complete all required fields",
    fillAllRequired: "Please fill in all required fields (marked with *)"
  },
  
  // ============================================
  // 📝 RESUME SECTION TEXT
  // ============================================
  resume: {
    uploadLabel: "Upload resume (PDF, DOC, DOCX, TXT, RTF)",
    noResumeLoaded: "No resume loaded yet. Upload a file to get personalized questions based on your experience."
  }
};

// ============================================
// 🔧 HELPER FUNCTION - Auto-replaces placeholders
// ============================================
// You don't need to edit this function!
// It automatically replaces {appName}, {year}, {company}
function getConfigText(key, replacements = {}) {
  let text = key.split('.').reduce((obj, k) => obj && obj[k], APP_CONFIG);
  if (typeof text === 'string') {
    // Apply custom replacements first
    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });
    // Auto-replace common placeholders
    text = text.replace(/{year}/g, APP_CONFIG.copyrightYear);
    text = text.replace(/{company}/g, APP_CONFIG.companyName);
    text = text.replace(/{appName}/g, APP_CONFIG.appName);
  }
  return text || key;
}

// ============================================
// 📋 BACKWARDS COMPATIBILITY
// ============================================
// Keep old config names working for existing code
const ONBOARDING_CONFIG = {
  title: APP_CONFIG.onboarding.title,
  subtitle: APP_CONFIG.onboarding.subtitle,
  resume: APP_CONFIG.onboardingResume,
  location: APP_CONFIG.onboardingLocation,
  jobType: APP_CONFIG.onboardingJobType,
  department: APP_CONFIG.onboardingDepartment,
  name: APP_CONFIG.onboardingName,
  voice: APP_CONFIG.onboardingVoice,
  submit: APP_CONFIG.onboardingSubmit,
  footer: { requiredFields: APP_CONFIG.onboardingSubmit.requiredFields },
  errors: APP_CONFIG.onboardingErrors
};

function getOnboardingText(key, replacements = {}) {
  // Map old ONBOARDING_CONFIG keys to new APP_CONFIG structure
  const keyMap = {
    'title': 'onboarding.title',
    'subtitle': 'onboarding.subtitle',
    'resume': 'onboardingResume',
    'location': 'onboardingLocation',
    'jobType': 'onboardingJobType',
    'department': 'onboardingDepartment',
    'name': 'onboardingName',
    'voice': 'onboardingVoice',
    'submit': 'onboardingSubmit',
    'footer': 'onboardingSubmit',
    'errors': 'onboardingErrors'
  };
  
  const mappedKey = keyMap[key] || key;
  return getConfigText(mappedKey, replacements);
}
