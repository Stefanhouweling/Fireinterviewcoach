// ============================================
// FIRE INTERVIEW COACH - ONBOARDING CONFIG
// ============================================
// Edit this file to easily update all text on the onboarding page
// Changes will be reflected immediately after saving

const ONBOARDING_CONFIG = {
  // Modal Title & Header
  title: "🎯 Let's Get Started",
  subtitle: "Tell us about yourself to personalize your interview practice",
  
  // Section 1: Resume Upload
  resume: {
    label: "1. Upload Resume",
    optional: "(Optional)",
    uploadButtonText: "Upload resume (.txt / PDF)",
    statusMessages: {
      reading: "Reading resume file...",
      parsing: "Parsing resume with AI...",
      success: "✓ Resume uploaded successfully!",
      error: "✗ Failed to upload resume. You can continue without it.",
      tooLarge: "File is too large. Please use a smaller file or a text version."
    }
  },
  
  // Section 2: Location
  location: {
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
      notAvailable: "Location search not available. Please type manually."
    }
  },
  
  // Section 3: Job Type
  jobType: {
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
  
  // Section 4: Department Name
  department: {
    label: "4. Department Name",
    required: "*",
    placeholder: "e.g., CoachAI Fire Department",
    helperText: "This will be used to personalize your interview questions"
  },
  
  // Section 5: Name (Optional)
  name: {
    label: "5. Your Name",
    optional: "(Optional)",
    placeholder: "e.g., John Smith",
    helperText: "AI will address you by name in some questions"
  },
  
  // Section 6: Voice Preference
  voice: {
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
  
  // Submit Button
  submit: {
    buttonText: "Start Practice Session"
  },
  
  // Footer
  footer: {
    requiredFields: "* Required fields"
  },
  
  // Error Messages
  errors: {
    cityRequired: "Please select or enter a city",
    countryRequired: "Please select a country",
    jobTypeRequired: "Please select a position type",
    departmentRequired: "Please enter a department name",
    formIncomplete: "Please complete all required fields"
  }
};

// Helper function to get config text (similar to main config)
function getOnboardingText(key, replacements = {}) {
  let text = key.split('.').reduce((obj, k) => obj && obj[k], ONBOARDING_CONFIG);
  if (typeof text === 'string') {
    Object.keys(replacements).forEach(placeholder => {
      text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });
  }
  return text || key;
}

