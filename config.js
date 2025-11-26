// ============================================
// FIRE INTERVIEW COACH - CONFIGURATION FILE
// ============================================
// Edit this file to easily update text throughout the application
// Changes will be reflected immediately after saving

const APP_CONFIG = {
  // App Information
  appName: "Fire Interview Coach",
  appTagline: "AI-Powered Interview Practice for Firefighters",
  copyrightYear: "2025",
  companyName: "Fire Interview CoachAI",
  
  // Header & Navigation
  headerTitle: "Fire Interview Coach",
  headerSubtitle: "AI-Powered Interview Practice",
  
  // Buttons
  buttons: {
    nextQuestion: "🎤 Next Question",
    repeatQuestion: "🔁 Repeat",
    answerQuestion: "🎤 Answer Question",
    finishAnswering: "✅ Finish Answering Question",
    analyzeAnswer: "🤖 Analyze Answer",
    startCamera: "📹 Start Camera",
    stopCamera: "⏹️ Stop Camera",
    uploadResume: "📄 Upload Resume",
    viewDetailedFeedback: "📖 View Detailed AI Feedback",
    askFollowup: "💬 Ask Follow-up Question",
    acceptTerms: "Accept & Continue"
  },
  
  // Practice Mode
  practiceMode: {
    interviewSimulation: "Interview Simulation (Random)",
    userSpecific: "User-Specific Practice",
    selectCategory: "Select Category"
  },
  
  // Status Messages
  status: {
    micIdle: "Mic idle",
    micListening: "Listening...",
    analyzing: "🤖 Analyzing Your Answer...",
    analyzingResume: "🤖 Analyzing resume with AI...",
    generatingQuestion: "🤖 Generating question...",
    contactingAI: "Contacting AI Interview Coach"
  },
  
  // Feedback Sections
  feedback: {
    contentStructure: "Content & Structure",
    voiceFillerWords: "Voice & Filler Words",
    bodyLanguage: "Body Language (Camera)",
    fireSpecificTips: "Fire-Specific Tips / AI Coach",
    feedbackOnAnswer: "Feedback on This Answer"
  },
  
  // Instructions & Help Text
  instructions: {
    welcome: "Welcome to Fire Interview Coach",
    getStarted: "Click <strong>Next Question</strong> to begin. AI will generate personalized questions based on your resume and conversation history.",
    uploadResumePrompt: "Upload your resume to get personalized interview questions",
    cameraInstructions: "Environment: Aim for chest-up framing, neutral background, good light.",
    cameraGoal: "Goal: calm but engaged, limited fidgeting."
  },
  
  // Footer
  footer: {
    copyright: "© {year} {company}. All rights reserved.",
    termsLink: "Terms of Service",
    privacyLink: "Privacy Policy",
    disclaimer: "{appName} is a practice tool only and does not guarantee job offers or employment."
  },
  
  // Modal Titles
  modals: {
    aiFeedback: "🤖 AI Interview Coach Feedback",
    termsTitle: "🔥 Welcome to Fire Interview Coach",
    termsSubtitle: "Please review and accept our terms to continue"
  },
  
  // Error Messages
  errors: {
    noTranscript: "No transcript found. Answer the question or type your answer first.",
    analysisFailed: "AI analysis failed.",
    checkConnection: "Check your connection and try again.",
    noFeedback: "AI didn't return any feedback. Please try again."
  },
  
  // Question Labels
  questionLabels: {
    questionNumber: "Question #{number}",
    mode: "Mode: AI-Powered Dynamic Panel (behavioural + technical + contextual followups)"
  }
};

// Helper function to replace placeholders
function getConfigText(key, replacements = {}) {
  let text = key.split('.').reduce((obj, k) => obj && obj[k], APP_CONFIG);
  if (typeof text === 'string') {
    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });
    // Auto-replace common placeholders
    text = text.replace('{year}', APP_CONFIG.copyrightYear);
    text = text.replace('{company}', APP_CONFIG.companyName);
    text = text.replace('{appName}', APP_CONFIG.appName);
  }
  return text || key;
}

