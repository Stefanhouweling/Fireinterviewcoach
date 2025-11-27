require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
// Use node-fetch for external API calls (Nominatim)
const fetchModule = require('node-fetch');
// Import question bank
const { getRandomQuestion, getQuestions, getQuestionStats } = require('./questionBank');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.json({ 
    service: 'Fire Interview Coach API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      question: 'POST /api/question',
      followup: 'POST /api/followup',
      analyze: 'POST /api/analyze-answer',
      parseResume: 'POST /api/parse-resume',
      tts: 'POST /api/tts',
      researchCity: 'POST /api/research-city',
      searchLocation: 'POST /api/search-location',
      feedback: 'POST /api/feedback'
    },
    message: 'API is running. Use the endpoints above to interact with the service.'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fire Interview Coach API is running' });
});

// GET /api/mapbox-token - Return Mapbox token (stored in environment variable)
app.get('/api/mapbox-token', (req, res) => {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    return res.status(404).json({ error: 'Mapbox token not configured' });
  }
  res.json({ token: token });
});

// POST /api/user-profile - Create or update user profile
app.post('/api/user-profile', async (req, res) => {
  try {
    const { sessionId, name, city, stateProvince, country, departmentName, jobType, voicePreference, resumeText, resumeAnalysis, cityResearch } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    const profile = updateUserProfile(sessionId, {
      name: name || null,
      city: city || null,
      stateProvince: stateProvince || null,
      country: country || null,
      departmentName: departmentName || null,
      jobType: jobType || null,
      voicePreference: voicePreference || null,
      resumeText: resumeText || null,
      resumeAnalysis: resumeAnalysis || null,
      cityResearch: cityResearch || null
    });
    
    res.json({ 
      success: true, 
      profile: {
        sessionId: profile.sessionId,
        name: profile.name,
        city: profile.city,
        stateProvince: profile.stateProvince,
        country: profile.country,
        departmentName: profile.departmentName,
        jobType: profile.jobType,
        voicePreference: profile.voicePreference,
        hasResume: !!profile.resumeText,
        hasCityResearch: !!profile.cityResearch,
        updatedAt: profile.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile', message: error.message });
  }
});

// GET /api/user-profile/:sessionId - Get user profile
app.get('/api/user-profile/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const profile = getUserProfile(sessionId);
    
    res.json({
      sessionId: profile.sessionId,
      name: profile.name,
      city: profile.city,
      stateProvince: profile.stateProvince,
      country: profile.country,
      departmentName: profile.departmentName,
      jobType: profile.jobType,
      voicePreference: profile.voicePreference,
      hasResume: !!profile.resumeText,
      hasCityResearch: !!profile.cityResearch,
      conversationCount: profile.conversationHistory.length,
      askedQuestionsCount: profile.askedQuestions.length,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile', message: error.message });
  }
});

// GET /api/question-stats - Get question bank statistics
app.get('/api/question-stats', (req, res) => {
  try {
    const stats = getQuestionStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting question stats:', error);
    res.status(500).json({ error: 'Failed to get question stats', message: error.message });
  }
});

// POST /api/question - Generate a new interview question
app.post('/api/question', async (req, res) => {
  try {
    const { sessionId, resumeText, resumeAnalysis, history, askedQuestions = [], askedCategories = [], practiceMode = "simulation", selectedCategory = "", onboardingData = null, questionType = null, difficulty = null, useQuestionBank = true } = req.body;
    
    // Get or create user profile
    let userProfile = null;
    if (sessionId) {
      userProfile = getUserProfile(sessionId);
      
      // Update profile with latest data if provided
      if (onboardingData) {
        updateUserProfile(sessionId, {
          name: onboardingData.name || userProfile.name,
          city: onboardingData.city || userProfile.city,
          stateProvince: onboardingData.stateProvince || userProfile.stateProvince,
          country: onboardingData.country || userProfile.country,
          departmentName: onboardingData.departmentName || userProfile.departmentName,
          jobType: onboardingData.jobType || userProfile.jobType,
          voicePreference: onboardingData.voicePreference || userProfile.voicePreference,
          cityResearch: onboardingData.cityResearch || userProfile.cityResearch
        });
        userProfile = getUserProfile(sessionId); // Refresh
      }
      
      if (resumeText) {
        updateUserProfile(sessionId, { resumeText });
        userProfile = getUserProfile(sessionId);
      }
      
    if (resumeAnalysis) {
        updateUserProfile(sessionId, { resumeAnalysis });
        userProfile = getUserProfile(sessionId);
      }
      
      // Update conversation history
      if (history && history.length > 0) {
        updateUserProfile(sessionId, { conversationHistory: history });
        userProfile = getUserProfile(sessionId);
      }
      
      // Update asked questions and categories
      if (askedQuestions.length > 0 || askedCategories.length > 0) {
        updateUserProfile(sessionId, { 
          askedQuestions: askedQuestions,
          askedCategories: askedCategories
        });
        userProfile = getUserProfile(sessionId);
      }
    }
    
    // Use profile data if available, otherwise fall back to request data
    const profileName = userProfile?.name || onboardingData?.name || null;
    const profileCity = userProfile?.city || onboardingData?.city || null;
    const profileStateProvince = userProfile?.stateProvince || onboardingData?.stateProvince || null;
    const profileCountry = userProfile?.country || onboardingData?.country || null;
    const profileDepartmentName = userProfile?.departmentName || onboardingData?.departmentName || null;
    const profileJobType = userProfile?.jobType || onboardingData?.jobType || null;
    const profileCityResearch = userProfile?.cityResearch || onboardingData?.cityResearch || null;
    const profileResumeText = userProfile?.resumeText || resumeText || null;
    const profileResumeAnalysis = userProfile?.resumeAnalysis || resumeAnalysis || null;
    const profileHistory = userProfile?.conversationHistory || history || [];
    const profileAskedQuestions = userProfile?.askedQuestions || askedQuestions || [];
    const profileAskedCategories = userProfile?.askedCategories || askedCategories || [];

    // Build comprehensive resume context (use profile data)
    let resumeContext = "";
    if (profileResumeAnalysis) {
      const analysis = profileResumeAnalysis;
      const allJobs = analysis.allJobs || analysis.workHistory || [];
      const jobsList = Array.isArray(allJobs) && allJobs.length > 0 
        ? allJobs.join("; ")
        : (Array.isArray(analysis.workHistory) ? analysis.workHistory.join("; ") : "N/A");
      
      resumeContext = `Resume Summary (COMPLETE - includes ALL jobs, not just fire-related):
- Total Experience: ${analysis.experience || analysis.yearsOfExperience || "N/A"} (includes ALL work experience)
- ALL Past Jobs: ${jobsList}
- Certifications: ${Array.isArray(analysis.certifications) ? analysis.certifications.join(", ") : "None listed"}
- Key Skills: ${Array.isArray(analysis.skills) ? analysis.skills.join(", ") : "General"}
- Education: ${analysis.education ? (Array.isArray(analysis.education) ? analysis.education.join(", ") : analysis.education) : "N/A"}
- Interview Focus Areas: ${Array.isArray(analysis.interviewFocus) ? analysis.interviewFocus.join(", ") : "General competencies"}

Full Resume Analysis: ${JSON.stringify(profileResumeAnalysis)}

IMPORTANT: Reference ALL past jobs and experiences when generating questions, not just fire-related experience. Past jobs in construction, retail, customer service, healthcare, etc. are all valuable for interview questions.`;
    } else if (profileResumeText) {
      resumeContext = `Resume Text (full text for context - includes ALL jobs and experience):
${profileResumeText}

IMPORTANT: Reference ALL past jobs and experiences when generating questions, not just fire-related experience.`;
    } else {
      resumeContext = "No resume provided";
    }
    
    const conversationContext = profileHistory && profileHistory.length > 0
      ? `\n\nPrevious questions asked:\n${profileHistory.slice(-3).map((item, i) => 
          `${i + 1}. Q: ${item.question}\n   A: ${item.answer ? item.answer.slice(0, 200) + "..." : "No answer yet"}`
        ).join("\n")}`
      : "";
    
    // Normalize asked categories (usually sent as lowercase from frontend)
    const normalizedAskedCategories = profileAskedCategories.map(c => String(c).toLowerCase());

    // Base category set we want to cycle through over a session
    const baseCategories = [
      "Behavioural – High Stress",
      "Behavioural – Conflict",
      "Safety & Accountability",
      "Medical / EMR",
      "Teamwork",
      "Community Focus",
      "Resilience",
      "Technical – Fireground"
    ];

    const unusedCategories = baseCategories.filter(
      c => !normalizedAskedCategories.includes(c.toLowerCase())
    );

    const categoryRotationHint = unusedCategories.length > 0
      ? `\n\nCategory rotation hint: The following base categories have NOT been used yet in this session: ${unusedCategories.join(", ")}.\nFor THIS next question, choose ONE of these unused categories and clearly state it as the category.`
      : `\n\nCategory rotation hint: All base categories have been used at least once.\nYou may reuse categories, but vary the scenario and angle significantly from earlier questions.`;

    const diversityContext = profileAskedQuestions.length > 0
      ? `\n\nCRITICAL - Questions already asked in this session (DO NOT repeat these):\n${profileAskedQuestions.slice(-10).map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nCategories already covered: ${profileAskedCategories.join(", ") || "None"}\n\nYou MUST generate a completely different question that hasn't been asked yet.${categoryRotationHint}`
      : `\n\nNo questions have been asked yet in this session. Start with any one of the base categories: ${baseCategories.join(", ")}. Make the category explicit.`;

    // Build comprehensive user profile context (city, department, job type, name, etc.)
    let userProfileContext = "";
    if (profileCity || profileDepartmentName || profileJobType || profileName) {
      const locationString = profileStateProvince 
        ? `${profileCity}, ${profileStateProvince}, ${profileCountry}`
        : `${profileCity}, ${profileCountry}`;
      
      userProfileContext = `\n\nCOMPREHENSIVE USER PROFILE (USE THIS TO CREATE HIGHLY PERSONALIZED QUESTIONS):
- Candidate Name: ${profileName || "Not provided"}
- Position Type: ${profileJobType || "Not specified"}
- Department: ${profileDepartmentName || "Not specified"}
- Location: ${locationString || "Not specified"}`;
      
      if (profileCityResearch) {
        userProfileContext += `\n\nCity/Department Research:\n${profileCityResearch}\n\nIMPORTANT: Incorporate specific, accurate information from this research into your questions when relevant. For example:
- Reference the department name: "Working for the ${profileDepartmentName} is a stressful job${profileName ? `, ${profileName}` : ''}, tell us about a time..."
- Reference city-specific challenges or initiatives from the research
- Reference the fire chief's name or department history when appropriate
- Make questions feel personalized to this specific department and city while still testing general competencies`;
      } else if (profileDepartmentName || profileCity) {
        userProfileContext += `\n\nIMPORTANT: When generating questions, incorporate the department name "${profileDepartmentName}" and location context naturally. For example: "Working for the ${profileDepartmentName} is a stressful job${profileName ? `, ${profileName}` : ''}, tell us about a time..." or "Given the challenges in ${profileCity}, how would you handle...". Make questions feel personalized to this specific department while still testing general competencies.`;
      }
      
      // Add name context if available
      if (profileName) {
        // Use name very randomly - only about 10-15% of the time
        userProfileContext += `\n\nIMPORTANT: The candidate's name is ${profileName}. Very occasionally address them by name in questions to make it more personal and realistic (e.g., "${profileName}, tell us about a time..." or "${profileName}, how would you..."). Use the name very sparingly - only about 10-15% of the time, and make it feel natural and random.`;
      }
    }

    // Determine question strategy based on mode, with heavy emphasis on personalization
    let questionStrategy = "";
    
    // Determine question type: if category is "Situational" or "Behavioral", use that; otherwise random
    let questionTypeToUse;
    if (selectedCategory === "Situational") {
      questionTypeToUse = 'situational';
    } else if (selectedCategory === "Behavioral") {
      questionTypeToUse = 'behavioral';
    } else {
      // Randomly choose between situational and behavioral when no specific category
      questionTypeToUse = questionType || (Math.random() < 0.5 ? 'behavioral' : 'situational');
    }
    
    const difficultyToUse = difficulty || (() => {
      const rand = Math.random();
      if (rand < 0.3) return 'easy';
      if (rand < 0.7) return 'medium';
      return 'hard';
    })();
    
    // Get a question from the bank for inspiration (matching type, difficulty, and category)
    let questionBankReference = null;
    let bankReferenceText = "";
    
    // Try to get a question from the bank that matches the criteria
    if (useQuestionBank) {
      try {
        // Map selectedCategory to question bank category if needed
        let bankCategory = selectedCategory;
        if (selectedCategory === "City & Department Specific") {
          bankCategory = null; // Let bank provide any category for inspiration
        }
        
        questionBankReference = getRandomQuestion(
          questionTypeToUse,
          difficultyToUse,
          bankCategory,
          profileAskedQuestions || []
        );
        
        if (questionBankReference) {
          console.log(`[QUESTION BANK] Selected question for inspiration: ${questionBankReference.category} - ${questionBankReference.question.substring(0, 60)}...`);
        }
      } catch (error) {
        console.error('[QUESTION BANK] Error getting question reference:', error);
      }
    }
    
    // Build personalization context
    let personalizationContext = "";
    if (profileName) {
      personalizationContext += `\n- Candidate's name: ${profileName} (address them by name very occasionally - only about 10-15% of questions, make it feel random and natural)`;
    }
    if (profileDepartmentName) {
      personalizationContext += `\n- Department: ${profileDepartmentName} (reference this department naturally when relevant)`;
    }
    if (profileCity) {
      personalizationContext += `\n- City: ${profileCity}${profileStateProvince ? `, ${profileStateProvince}` : ''}${profileCountry ? `, ${profileCountry}` : ''} (reference city-specific challenges or context when appropriate)`;
    }
    if (profileJobType) {
      personalizationContext += `\n- Position: ${profileJobType}`;
    }
    if (profileResumeAnalysis) {
      const allJobs = profileResumeAnalysis.allJobs || profileResumeAnalysis.workHistory || [];
      const jobsText = Array.isArray(allJobs) && allJobs.length > 0 
        ? `All past jobs: ${allJobs.slice(0, 5).join("; ")}${allJobs.length > 5 ? "..." : ""}`
        : "Work history available";
      personalizationContext += `\n- Resume highlights: ${profileResumeAnalysis.experience || 'N/A'} total experience (ALL jobs), ${jobsText}, Certifications: ${Array.isArray(profileResumeAnalysis.certifications) ? profileResumeAnalysis.certifications.slice(0, 3).join(", ") : 'None'}, Key skills: ${Array.isArray(profileResumeAnalysis.skills) ? profileResumeAnalysis.skills.slice(0, 5).join(", ") : 'General'}`;
    }
    if (profileCityResearch) {
      personalizationContext += `\n- City/Department research available: Use specific details from this research to make questions feel authentic and personalized to this exact department and location.`;
    }
    
    if (practiceMode === "specific" && selectedCategory) {
      if (selectedCategory === "Situational") {
        questionStrategy = `Generate a SITUATIONAL question (${difficultyToUse} difficulty). A situational question presents a hypothetical scenario and asks what the candidate would do.${personalizationContext}

CRITICAL REQUIREMENTS:
- This MUST be a SITUATIONAL question (hypothetical scenario)
- Use formats like: "How would you handle...", "What would you do if...", "How would you approach...", "Imagine you are...", "You are faced with..."
- DO NOT use "Tell us about a time..." or "Describe a situation where..." (those are behavioral questions)
- Present a specific scenario or situation laid out for the candidate
- Ask them to explain what they would do in that situation
- Test their judgment, decision-making, chain of command understanding, ethics, and approach
- Personalize using the candidate's profile information (name, department, city, resume) when relevant
- Make it feel like a real interview question tailored to this candidate

EXAMPLES OF GOOD SITUATIONAL QUESTIONS:
- "How would you handle a situation if you felt you weren't treated fairly?"
- "Your Captain orders you to get a radio from the engine. On the way a senior fire officer stops you and asks you to deliver an axe to the team on the roof right away. How would you handle this?"
- "How would you handle a leader where you question their leadership, would you still respect them?"
- "Imagine you're on a call and you notice a safety violation that could put your team at risk. How would you address this?"
- "What would you do if you saw a fellow firefighter engaging in behavior that violates department policy?"

The question should present a clear situation and ask what they would do, not ask about past experiences.`;
      } else if (selectedCategory === "Behavioral") {
        questionStrategy = `Generate a BEHAVIORAL question (${difficultyToUse} difficulty). A behavioral question asks about past experiences and past behavior.${personalizationContext}

CRITICAL REQUIREMENTS:
- This MUST be a BEHAVIORAL question (past experiences)
- Use formats like: "Tell us about a time when...", "Describe a situation where...", "Give me an example of...", "Share an experience where...", "Can you recall a time when..."
- DO NOT use "How would you handle..." or "What would you do if..." (those are situational questions)
- Ask about actual past experiences and behaviors
- Test their ability to reflect on past actions and learn from experiences
- Personalize using the candidate's profile information (name, department, city, resume) when relevant
- Make it feel like a real interview question tailored to this candidate

EXAMPLES OF GOOD BEHAVIORAL QUESTIONS:
- "Tell us about a time when you had to work under extreme pressure."
- "Describe a situation where you had to resolve a conflict with a team member."
- "Give me an example of a time when you had to make a difficult decision quickly."
- "Share an experience where you had to adapt to a sudden change in plans."
- "Can you recall a time when you had to step up and take leadership in a challenging situation?"

The question should ask about past experiences and behaviors, not hypothetical future scenarios.`;
      } else if (selectedCategory === "Resume-Based") {
        questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) SPECIFICALLY personalized to this candidate's COMPLETE resume and background.${personalizationContext}

CRITICAL PERSONALIZATION REQUIREMENTS:
- Reference their ACTUAL experience from ALL past jobs (fire-related AND non-fire-related jobs like construction, retail, customer service, healthcare, etc.)
- Reference their certifications, skills, and achievements from ALL their work experience
- Use their name naturally (${profileName ? profileName : 'if provided'})
- Connect the question to their COMPLETE background while still testing general firefighter competencies
- Make it feel like the panel researched their ENTIRE resume and is asking a tailored question
- Examples: 
  * If they have construction experience, ask about safety protocols or working in teams
  * If they have customer service experience, ask about communication or conflict resolution
  * If they have healthcare experience, ask about medical scenarios or patient care
  * If they have retail experience, ask about following procedures or handling stress
  * If they have EMR certification, ask about a medical scenario
  * Draw from ALL their past jobs, not just fire-related experience

IMPORTANT: Reference ALL their work history, not just fire-related jobs. Past jobs provide valuable transferable skills and experiences that are relevant to firefighting. However, keep it general enough that it tests their judgment and understanding, not just their specific past. Mix resume-specific elements with general firefighter competencies.`;
      } else if (selectedCategory === "City & Department Specific") {
        questionStrategy = `CRITICAL: Generate a KNOWLEDGE-TESTING question (NOT behavioral or situational) that asks about SPECIFIC FACTS regarding ${profileCity || 'the city'} and ${profileDepartmentName || 'the department'}.${personalizationContext}

THIS CATEGORY IS FOR KNOWLEDGE TESTS ONLY - NOT BEHAVIORAL/SITUATIONAL QUESTIONS:
- DO NOT ask "How would you handle..." or "Tell us about a time..."
- DO NOT ask about hypothetical scenarios or past experiences
- DO ask "Who is...", "What is...", "How many...", "When did...", "What is the..."
- The question MUST test factual knowledge that a well-prepared candidate should know

REQUIRED KNOWLEDGE AREAS TO TEST (use city research data):
1. City Leadership: "Who is the mayor of ${profileCity || 'this city'}?" "What are the mayor's priorities for emergency services?"
2. Fire Department Leadership: "Who is the fire chief of ${profileDepartmentName || 'this department'}?" "Who are the deputy chiefs?"
3. Department Details: "How many members does ${profileDepartmentName || 'the department'} have?" "How many fire stations does ${profileDepartmentName || 'the department'} operate?"
4. Union Information: "What is the local union number for ${profileDepartmentName || 'the fire department'}?" "What union represents ${profileDepartmentName || 'this department'}?"
5. Department History: "When was ${profileDepartmentName || 'this department'} established?" "What is the history of ${profileDepartmentName || 'this department'}?"
6. City/Department Facts: "What are the main industries in ${profileCity || 'this city'}?" "What challenges does ${profileCity || 'this city'} face?"

QUESTION FORMAT EXAMPLES (USE THESE STYLES - VARIETY IS KEY):
Leadership & Structure:
- "${profileName ? profileName + ', ' : ''}Who is the fire chief of ${profileDepartmentName || 'this department'}?"
- "Who are the deputy chiefs of ${profileDepartmentName || 'this department'}?"
- "What is the organizational structure of ${profileDepartmentName || 'this department'}?"
- "Who is the mayor of ${profileCity || 'this city'}?"
- "What city council members serve on the public safety committee for ${profileCity || 'this city'}?"

Union & Labor:
- "What is the local union number for ${profileDepartmentName || 'the fire department'} in ${profileCity || 'this city'}?"
- "What union represents ${profileDepartmentName || 'this department'}?"
- "Who is the union president for ${profileDepartmentName || 'this department'}?"

Department Size & Resources:
- "How many members does ${profileDepartmentName || 'the department'} currently have?"
- "How many fire stations does ${profileDepartmentName || 'the department'} operate?"
- "How many apparatus/engines does ${profileDepartmentName || 'the department'} have?"
- "What is the annual budget for ${profileDepartmentName || 'this department'}?"

Department History:
- "When was ${profileDepartmentName || 'this department'} first established as a career department?"
- "Can you tell us about the history of ${profileDepartmentName || 'this department'}?"
- "What are some significant milestones in ${profileDepartmentName || 'this department'}'s history?"
- "When did ${profileDepartmentName || 'this department'} transition from volunteer to career?"

City & Department Context:
- "What are the main industries in ${profileCity || 'this city'}?"
- "What unique challenges does ${profileCity || 'this city'} face that affect fire department operations?"
- "What is the population of ${profileCity || 'this city'}?"
- "What response areas or coverage zones does ${profileDepartmentName || 'this department'} serve?"
- "How does ${profileDepartmentName || 'this department'} coordinate with neighboring fire departments?"

Programs & Initiatives:
- "What community programs does ${profileDepartmentName || 'this department'} participate in?"
- "What fire prevention programs does ${profileDepartmentName || 'this department'} offer?"
- "What recent initiatives has ${profileDepartmentName || 'this department'} implemented?"
- "Does ${profileDepartmentName || 'this department'} participate in any mutual aid agreements?"

Values & Mission:
- "What are the core values of ${profileDepartmentName || 'this department'}?"
- "What is the mission statement of ${profileDepartmentName || 'this department'}?"
- "What makes ${profileDepartmentName || 'this department'} unique or special?"

Equipment & Capabilities:
- "What specialized equipment or apparatus does ${profileDepartmentName || 'this department'} have?"
- "Does ${profileDepartmentName || 'this department'} have any technical rescue capabilities?"
- "What type of hazmat response capabilities does ${profileDepartmentName || 'this department'} have?"

ABSOLUTELY FORBIDDEN QUESTION TYPES:
- "How would you handle..." (situational)
- "Tell us about a time..." (behavioral)
- "What would you do if..." (hypothetical)
- Any question about past experiences or future scenarios

REQUIRED: The question MUST be a direct knowledge question asking about a specific fact. Use the city research data to find the actual facts and ask about them.

IMPORTANT: Only ask knowledge questions about facts that are available in the city research data. If the research data doesn't contain specific information (e.g., "Information not found"), do NOT ask about that topic. Ask about facts that ARE available in the research.`;
      } else {
        questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) focused EXCLUSIVELY on the category: "${selectedCategory}".${personalizationContext}

CRITICAL REQUIREMENTS:
- The question MUST be about "${selectedCategory}" and ONLY this category
- Do NOT generate questions about other categories like "Behavioural – High Stress", "Medical / EMR", "Teamwork", etc.
- The question must directly test competencies related to "${selectedCategory}"
- Personalize it using the candidate's profile information above
- Reference their name (${profileName ? profileName : 'if provided'}), department, city, or resume when relevant
- Make it feel tailored to this specific candidate while still testing the "${selectedCategory}" competency area
- Make it relevant to this specific area while still being a general situational question that tests judgment

CATEGORY-SPECIFIC GUIDANCE:
- If category is "Behavioural – High Stress": Focus on stress management, pressure situations, crisis response
- If category is "Behavioural – Conflict": Focus on conflict resolution, disagreements, interpersonal challenges
- If category is "Safety & Accountability": Focus on safety protocols, hazard recognition, responsibility
- If category is "Medical / EMR": Focus on medical emergencies, patient care, first aid scenarios
- If category is "Teamwork": Focus on collaboration, team dynamics, working with others
- If category is "Community Focus": Focus on public service, community relations, citizen interaction
- If category is "Resilience": Focus on overcoming challenges, bouncing back, perseverance
- If category is "Technical – Fireground": Focus on firefighting techniques, equipment, fireground operations

IMPORTANT: The question MUST stay within the "${selectedCategory}" category. Do not drift into other competency areas.`;
      }
    } else if (practiceMode === "simulation") {
      questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) for an interview simulation.${personalizationContext}

CRITICAL PERSONALIZATION REQUIREMENTS:
- HEAVILY personalize this question using ALL available profile information
- Use the candidate's name (${profileName ? profileName : 'if provided'}) very occasionally - only about 10-15% of the time, make it feel random
- Reference their department "${profileDepartmentName || '[if provided]'}" when relevant
- Reference their city "${profileCity || '[if provided]'}" and use city research details when appropriate
- Reference their COMPLETE resume background (ALL past jobs including non-fire jobs, experience, certifications, skills) naturally when it fits
- Make it feel like a real panel member who has reviewed their ENTIRE application is asking

${questionTypeToUse === 'behavioral' ? 'Use "Tell us about a time..." format asking about past experience (BEHAVIORAL question).' : 'Use "How would you handle..." format asking about a hypothetical situation (SITUATIONAL question).'} 

IMPORTANT: Randomly vary between behavioral and situational questions. This is a ${questionTypeToUse} question.

Vary the topics to simulate a real interview where questions come from different areas. Mix personalized questions (about 60-70% personalized to their profile, 30-40% general) if profile information is available.`;
    } else {
      questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) mixing general firefighter competencies with heavy personalization.${personalizationContext}

CRITICAL PERSONALIZATION REQUIREMENTS:
- Use ALL available profile information to personalize this question
- Reference their name, department, city, and resume naturally
- Make it feel tailored to this specific candidate
- About 60-70% personalized to their profile, 30-40% general if profile information is available.`;
    }
    
    // Add question bank reference as inspiration if available
    // (This is defined earlier in the code, but ensure it's always initialized)
    if (questionBankReference) {
      bankReferenceText = `\n\nQUESTION BANK REFERENCE (use as inspiration and personalize it):
- Type: ${questionBankReference.type}
- Difficulty: ${questionBankReference.difficulty}
- Category: ${questionBankReference.category}
- Example question: "${questionBankReference.question}"

CRITICAL INSTRUCTIONS:
1. Use this question as a BASE/INSPIRATION for creating a personalized version
2. DO NOT ask the exact same question - personalize it using the candidate's profile information
3. Incorporate their name (if provided, very occasionally), department, city, resume background, etc.
4. Maintain the same TYPE (${questionBankReference.type}), DIFFICULTY level (${questionBankReference.difficulty}), and CATEGORY focus (${questionBankReference.category})
5. Make it feel like a real interview question tailored specifically to this candidate
6. Replace placeholders like [CITY], [DEPARTMENT], {job_title}, {company}, etc. with actual information from the profile
7. The final question should be UNIQUE and PERSONALIZED, not a direct copy

Example transformation:
- Original: "What do you know about the demographics of [CITY]?"
- Personalized: "Given your background in ${profileCity || 'this city'}, what do you think are the biggest fire-related risks in ${profileCity || 'this city'} and how would your experience help you serve this community?"

Remember: Personalize and tailor, but keep the core competency being tested the same.`;
    } else {
      bankReferenceText = "";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert firefighter interview panel member who has thoroughly reviewed the candidate's application, resume, and profile. Your role is to generate highly personalized, realistic, and challenging interview questions that:

1. HEAVILY personalize questions using the candidate's profile (name, department, city, resume, city research)
2. Make questions feel authentic and tailored specifically to THIS candidate
3. Test behavioral competencies, technical knowledge, and situational judgment
4. Reference their COMPLETE background naturally (ALL past jobs including non-fire jobs, experience, certifications, skills, department, city)
5. Address them by name very occasionally (only about 10-15% of questions, make it feel random)
6. Incorporate specific details from city/department research to make questions feel authentic
7. Test judgment, ethics, chain of command, and decision-making
8. Ensure questions are UNIQUE and cover diverse topics/areas
9. Vary between behavioral ("Tell us about a time...") and situational ("How would you handle...") questions

CRITICAL EXCEPTION: If the category is "City & Department Specific", you MUST generate KNOWLEDGE-TESTING questions (Who/What/When/How many) about specific facts, NOT behavioral or situational questions. For this category only, ask about factual information like fire chief's name, union number, department size, mayor's name, etc.

CRITICAL: Personalization is KEY. The questions should feel like they were crafted specifically for this candidate after reviewing their complete application package. Use ALL available profile information to create authentic, personalized questions that still test general firefighter competencies.`
        },
        {
          role: "user",
          content: `Generate a single ${profileJobType || 'firefighter'} interview question.

${questionStrategy}${bankReferenceText}

${resumeContext}${diversityContext}${userProfileContext}

CRITICAL PERSONALIZATION INSTRUCTIONS:
- HEAVILY personalize this question using ALL available profile information
- If a name is provided, address them by name very occasionally (only about 10-15% of the time, make it feel random)
- If a department is provided, reference it naturally when relevant
- If city research is available, incorporate specific, authentic details
- If resume information is available, reference their background naturally
- Make it feel like a real panel member who has thoroughly reviewed their application is asking
- The question should feel tailored specifically to THIS candidate while still testing general competencies

${selectedCategory === "City & Department Specific" ? `\n\nCRITICAL: This is the "City & Department Specific" category. The question MUST be a KNOWLEDGE-TESTING question asking about SPECIFIC FACTS about ${profileCity || 'the city'} and ${profileDepartmentName || 'the department'}.

FORBIDDEN: Do NOT generate behavioral questions ("Tell us about a time...") or situational questions ("How would you handle..."). 
REQUIRED: Generate a direct knowledge question like "Who is the fire chief?" or "What is the union number?" or "How many members does the department have?"

Use the city research data provided above to find specific facts and ask about them.` : selectedCategory && selectedCategory !== "Resume-Based" ? `\nCRITICAL CATEGORY REQUIREMENT: The question MUST be about "${selectedCategory}" category ONLY. Do NOT generate questions about other categories. Stay strictly within the "${selectedCategory}" competency area.` : ''}

IMPORTANT: This is a NEW, UNRELATED question. Do NOT make it a follow-up to previous questions. Generate a completely fresh question from a different topic/angle.

The question must be highly personalized and feel authentic to this specific candidate's application.

Requirements:
${selectedCategory && selectedCategory !== "Resume-Based" && selectedCategory !== "City & Department Specific" ? `- CRITICAL: The question MUST be about "${selectedCategory}" category. The category in your response MUST be exactly "${selectedCategory}". Do not use a different category.
- Stay strictly within the "${selectedCategory}" competency area. Do NOT generate questions about other categories.
` : practiceMode === "simulation" ? `- Question should be a GENERAL situational/hypothetical question (like "How would you handle a situation if...")
- Keep it broad and applicable to all candidates, not overly specific to their resume
- Ensure diversity: Cover different topics and areas. If many questions have been asked, explore new categories/topics. Vary between: chain of command, ethics, conflict resolution, safety, teamwork, leadership, decision-making, communication, stress management, equipment, training, etc.
` : `- Question should be a GENERAL situational/hypothetical question (like "How would you handle a situation if...")
- Keep it broad and applicable to all candidates, not overly specific to their resume
`}
- Examples of good questions:
${selectedCategory === "City & Department Specific" ? `  * KNOWLEDGE QUESTIONS (REQUIRED for this category - use city research data):
    * Leadership: "${profileName ? profileName + ', ' : ''}Who is the fire chief of ${profileDepartmentName || 'this department'}?" "Who are the deputy chiefs?"
    * Union: "What is the local union number for ${profileDepartmentName || 'the fire department'}?" "Who is the union president?"
    * Department Size: "How many members does ${profileDepartmentName || 'the department'} have?" "How many fire stations does ${profileDepartmentName || 'the department'} operate?"
    * City Leadership: "Who is the mayor of ${profileCity || 'this city'}?" "What are the mayor's priorities for emergency services?"
    * History: "When was ${profileDepartmentName || 'this department'} established?" "What significant milestones has ${profileDepartmentName || 'this department'} achieved?"
    * Programs: "What community programs does ${profileDepartmentName || 'this department'} participate in?" "What fire prevention programs does ${profileDepartmentName || 'this department'} offer?"
    * City Context: "What are the main industries in ${profileCity || 'this city'}?" "What is the population of ${profileCity || 'this city'}?"
    * Equipment: "What specialized equipment does ${profileDepartmentName || 'this department'} have?" "What technical rescue capabilities does ${profileDepartmentName || 'this department'} have?"
    * Values: "What are the core values of ${profileDepartmentName || 'this department'}?" "What is the mission statement of ${profileDepartmentName || 'this department'}?"
  * FORBIDDEN: "How would you handle..." or "Tell us about a time..." (these are behavioral/situational, NOT knowledge questions)` : `  * Behavioral/Situational questions:
  * "How would you handle a situation if you felt you weren't treated fairly?"
  * "How would you handle a leader where you question their leadership, would you still respect them?"
  * "Your Captain orders you to get a radio from the engine. On the way a senior fire officer stops you and asks you to deliver an axe to the team on the roof right away. How would you handle this?"
    * Resume-based example: "Given your experience with [specific certification/experience from resume], how would you approach a situation where you need to apply that knowledge under pressure?"`}
- Test: ${selectedCategory === "City & Department Specific" ? 'candidate knowledge of specific facts about the city and department' : 'chain of command, ethics, judgment, decision-making, conflict resolution'}
- CRITICAL: The question MUST be completely different from any question already asked (see list above)
${practiceMode === "simulation" ? `- If resume is provided and mode allows, occasionally reference different aspects of their background (certifications, experience, skills) but keep questions general enough for all candidates
- Rotate through different question types: hypothetical scenarios, ethical dilemmas, chain of command situations, team dynamics, safety protocols, etc.
` : ''}
- Format: "Category: [category]\nQuestion: [question text]"
${selectedCategory && selectedCategory !== "Resume-Based" && selectedCategory !== "City & Department Specific" ? `\nCRITICAL: The category in your response MUST be exactly "${selectedCategory}". Do not use a different category name.` : ''}

Return ONLY the category and question in that format.`
        }
      ]
    });

    const content = response.choices[0].message.content;
    const categoryMatch = content.match(/Category:\s*(.+)/i);
    const questionMatch = content.match(/Question:\s*(.+)/is);
    
    const category = categoryMatch ? categoryMatch[1].trim() : "General";
    const question = questionMatch ? questionMatch[1].trim() : content.trim();

    res.json({
      category,
      template: question,
      tags: [],
      isAI: true,
      isFollowup: false
    });
  } catch (error) {
    console.error('Error generating question:', error);
    res.status(500).json({ error: 'Failed to generate question', message: error.message });
  }
});

// POST /api/followup - Generate a follow-up question
app.post('/api/followup', async (req, res) => {
  try {
    const { lastQuestion, lastAnswer, history } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert firefighter interview panel member. Generate a followup question that digs deeper into the candidate's answer, just like a real panel would. Ask for clarification, more detail, or explore a related aspect."
        },
        {
          role: "user",
          content: `The candidate was asked: "${lastQuestion}"

Their answer: "${lastAnswer.slice(0, 1000)}"

Generate a followup question that:
- Probes deeper into their answer
- Asks for specific examples or clarification
- Tests their knowledge or judgment further
- Is what a real firefighter panel would ask next

Format: "Category: [category]\nQuestion: [question text]"

Return ONLY the category and question.`
        }
      ]
    });

    const content = response.choices[0].message.content;
    const categoryMatch = content.match(/Category:\s*(.+)/i);
    const questionMatch = content.match(/Question:\s*(.+)/is);
    
    const category = categoryMatch ? categoryMatch[1].trim() : "Followup";
    const question = questionMatch ? questionMatch[1].trim() : content.trim();

    res.json({
      category,
      template: question,
      tags: [],
      isAI: true,
      isFollowup: true
    });
  } catch (error) {
    console.error('Error generating followup:', error);
    res.status(500).json({ error: 'Failed to generate followup question', message: error.message });
  }
});

// POST /api/analyze-answer - Analyze candidate's answer
app.post('/api/analyze-answer', async (req, res) => {
  try {
    const { question, answer, motionScore, resumeAnalysis, resumeText, conversationHistory = [], cityResearch, category } = req.body;

    // Check if this is a knowledge-testing question (City & Department Specific)
    const isKnowledgeQuestion = category === "City & Department Specific" ||
                                question.toLowerCase().match(/^(who is|what is|how many|when was|what are)/) ||
                                question.toLowerCase().includes('who is the') ||
                                question.toLowerCase().includes('what is the') ||
                                question.toLowerCase().includes('how many') ||
                                question.toLowerCase().includes('when was');

    const resumeContext = resumeAnalysis 
      ? `Resume Analysis: ${JSON.stringify(resumeAnalysis)}`
      : resumeText 
        ? `Resume (full): ${resumeText}`
        : "No resume provided";
    
    // Build knowledge verification context if this is a knowledge question
    let knowledgeVerificationContext = "";
    if (isKnowledgeQuestion && cityResearch) {
      knowledgeVerificationContext = `\n\nCRITICAL: This is a KNOWLEDGE-TESTING question. You MUST verify the candidate's answer against the research data provided below.

CITY/DEPARTMENT RESEARCH DATA (use this to verify the answer):
${cityResearch}

VERIFICATION REQUIREMENTS:
1. Check if the candidate's answer is CORRECT or INCORRECT based on the research data
2. If incorrect, provide the CORRECT answer from the research data
3. If partially correct, specify what was correct and what was missing/incorrect
4. If they missed important details, list what they missed
5. Provide specific factual corrections, not just general feedback

The feedback MUST include:
- Whether the answer was correct, incorrect, or partially correct
- The correct answer (if they got it wrong or missed details)
- What specific facts they missed (if any)
- How accurate their knowledge is of the city/department`;
    } else if (isKnowledgeQuestion && !cityResearch) {
      // If it's a knowledge question but we don't have research, note this in feedback
      knowledgeVerificationContext = `\n\nNOTE: This appears to be a knowledge-testing question, but research data is not available to verify the answer. Provide general feedback on the answer's completeness and structure.`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert firefighter interview coach. Your goal is to help candidates develop better answers. IMPORTANT: Distinguish between two types of questions:\n\n1. BEHAVIORAL QUESTIONS (past experiences): \"Tell me about a time when...\", \"Describe a situation where...\", \"Give me an example of...\" - Use STAR method (Situation-Task-Action-Result) for these\n2. HYPOTHETICAL/SITUATIONAL QUESTIONS: \"How would you...\", \"What would you do if...\", \"How would you approach...\" - DO NOT use STAR method for these. Focus on: approach, reasoning, chain of command, ethics, decision-making process, specific steps they would take.\n\nBe encouraging, specific, and actionable. Provide constructive feedback on what firefighter panels actually look for."
        },
        {
          role: "user",
          content: "You are an expert firefighter interview coach. Your goal is to help candidates develop better answers.\n\n" +
            "Interview Question: " + question + "\n" +
            `Question Category: ${category || 'General'}\n\n` +
            "Candidate's Answer:\n" +
            "\"" + String(answer).replace(/"/g, '\\"') + "\"\n\n" +
            "Body Language Score (higher = more movement/fidgeting): " + (motionScore ?? "unknown") + "\n" +
            resumeContext + knowledgeVerificationContext + "\n\n" +
            (isKnowledgeQuestion ? 
            "CRITICAL: This is a KNOWLEDGE-TESTING question. You MUST:\n" +
            "1. Verify the candidate's answer against the research data provided\n" +
            "2. State clearly if the answer was CORRECT, INCORRECT, or PARTIALLY CORRECT\n" +
            "3. If incorrect or partially correct, provide the CORRECT answer from the research data\n" +
            "4. List any specific facts they missed\n" +
            "5. Score based on accuracy: 10/10 = completely correct with all details, lower scores for incorrect or incomplete answers\n\n" :
            "CRITICAL: First, determine if this is a BEHAVIORAL question (past experience) or HYPOTHETICAL question (future scenario).\n\n" +
            "- BEHAVIORAL questions: \"Tell me about a time when...\", \"Describe a situation where...\", \"Give me an example of...\"\n" +
            "  → Use STAR method (Situation-Task-Action-Result) for these.\n\n" +
            "- HYPOTHETICAL questions: \"How would you...\", \"What would you do if...\", \"How would you approach...\"\n" +
            "  → DO NOT use STAR method for these. Focus on: approach, reasoning, chain of command, ethics, decision-making process, specific steps they would take.\n\n") +
            "Keep the response concise and easy to skim. Avoid long paragraphs. Use short sentences and compact sections.\n\n" +
            "STRUCTURE YOUR RESPONSE EXACTLY LIKE THIS (use markdown headings and bold labels with double asterisks, NOT star symbols):\n\n" +
            "## Answer Summary & Score\n" +
            (isKnowledgeQuestion ?
            "- **Summary:** [1–2 short sentences summarizing what they said, and whether it was correct or incorrect]\n" +
            "- **Correctness:** [State clearly: CORRECT, INCORRECT, or PARTIALLY CORRECT. If incorrect/partial, provide the correct answer from research data]\n" +
            "- **Score:** [X/10 – based on accuracy. 10/10 = completely correct with all details, lower for incorrect/incomplete answers]\n" :
            "- **Summary:** [1–2 short sentences summarizing what they actually said, using plain language]\n" +
            "- **Score:** [X/10 – very short explanation of why, and what would make it a 10/10]\n") +
            "\n\n## What You Did Well\n" +
            "- **Positive 1:** [Short, specific positive point]" +
            (isKnowledgeQuestion ? " (e.g., 'Got the fire chief's name correct' or 'Knew the union number')" : "") + "\n" +
            "- **Positive 2:** [Short, specific positive point]\n" +
            "- **Positive 3 (optional):** [Only if there is a clear extra strength]\n\n" +
            "## What To Improve Next\n" +
            "- **Focus 1:** " + (isKnowledgeQuestion ? "[If incorrect: 'The correct answer is [correct answer from research].' If missed details: 'You missed [specific fact].']" : "[Very practical change they can make next time]") + "\n" +
            "- **Focus 2:** [Another clear tweak or addition]\n" +
            "- **Focus 3 (optional):** [Only if it adds real value]\n\n" +
            (isKnowledgeQuestion ? 
            "## Correct Answer (from Research Data)\n" +
            "Provide the complete, correct answer based on the research data:\n" +
            "- **Correct Answer:** [The full, accurate answer from the research data]\n" +
            "- **Additional Details:** [Any relevant context or additional facts they should know]\n\n" :
            "## STAR or Approach Overview\n" +
            "If this is a BEHAVIORAL (past) question, use STAR in a very compact way:\n" +
            "- **Situation:** [1 short sentence: how they should set the scene]\n" +
            "- **Task:** [1 short sentence: what the goal or responsibility was]\n" +
            "- **Action:** [1–2 short sentences: the key actions they should clearly state]\n" +
            "- **Result:** [1 short sentence: the outcome + what changed or improved]\n\n" +
            "If this is a HYPOTHETICAL (future) question, DO NOT use STAR. Instead, describe a clear approach:\n" +
            "- **Step 1:** [What they should do first and why]\n" +
            "- **Step 2:** [Next key step, including chain of command / safety / communication]\n" +
            "- **Step 3:** [How they would wrap up, debrief, or follow up]\n\n" +
            "## Panel-Ready 10/10 Answer\n" +
            "Write a single, polished answer that would earn 10/10 on a real firefighter panel. Use the candidate's ideas and resume context but clean them up:\n" +
            "- 1 short opening sentence that orients the panel.\n" +
            "- 1–2 short paragraphs that walk through the STAR story or hypothetical approach clearly.\n" +
            "- Keep language natural, plain, and realistic for a firefighter candidate.\n\n") +
            "Rules:\n" +
            "- Use markdown bullets (dash) with bold labels using double asterisks, e.g., use dash followed by space and double asterisks for bold.\n" +
            "- Do NOT use star symbols or plain asterisks for formatting.\n" +
            "- Keep each bullet to 1–2 short sentences.\n" +
            "- Avoid walls of text – this should feel light, skimmable, and coach-like.\n" +
            "- Be encouraging but very specific and honest about what needs to improve."
        }
      ]
    });

    const aiFeedback = response.choices[0].message.content;
    res.json({ feedback: aiFeedback });
  } catch (error) {
    console.error('Error analyzing answer:', error);
    res.status(500).json({ error: 'Failed to analyze answer', message: error.message });
  }
});

// POST /api/parse-resume - Parse resume with AI
app.post('/api/parse-resume', async (req, res) => {
  try {
    const { resumeText } = req.body;

    if (!resumeText || resumeText.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Resume text is required',
        message: 'No resume text provided'
      });
    }

    console.log(`[RESUME] Parsing resume, text length: ${resumeText.length} characters`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert at analyzing resumes. Extract ALL information from the resume, including ALL past jobs and work experience, not just fire-related experience. Extract structured information in JSON format."
        },
        {
          role: "user",
          content: `Analyze this COMPLETE resume and extract ALL information, including ALL past jobs and work experience (fire-related AND non-fire-related):

CRITICAL: Extract ALL work history, including:
- ALL past jobs (fire-related AND non-fire-related jobs like construction, retail, customer service, healthcare, etc.)
- ALL work experience, even if not directly related to firefighting
- Years of experience in each role
- Certifications (fire-related like EMR, POC, etc. AND any other certifications)
- ALL skills (fire-related AND transferable skills from other jobs)
- Key achievements from ALL jobs
- Education background
- Areas that would be interesting for interview questions (draw from ALL experience, not just fire-related)

Resume text (full text - analyze completely):
${resumeText}

Return a JSON object with this structure:
{
  "experience": "X years total (include all work experience)",
  "certifications": ["cert1", "cert2"],
  "skills": ["skill1", "skill2"],
  "workHistory": ["ALL jobs - job1 with details", "ALL jobs - job2 with details", "Include non-fire jobs too"],
  "achievements": ["achievement1 from all jobs"],
  "interviewFocus": ["area1", "area2"],
  "education": ["education details"],
  "allJobs": ["Complete list of ALL jobs with company names, titles, and dates"]
}

IMPORTANT: Include ALL jobs, not just fire-related ones. For example, if they worked in construction, retail, customer service, healthcare, etc., include those jobs in workHistory and allJobs. These experiences are valuable for interview questions too.`
        }
      ],
      response_format: { type: "json_object" }
    });

    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Invalid response from OpenAI API');
    }

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI API');
    }

    let resumeAnalysis;
    try {
      resumeAnalysis = typeof content === "string" ? JSON.parse(content) : content;
    } catch (parseError) {
      console.error('[RESUME] JSON parse error:', parseError);
      console.error('[RESUME] Content received:', content);
      throw new Error('Failed to parse JSON response from AI');
    }

    console.log('[RESUME] Successfully parsed resume analysis');
    res.json({ analysis: resumeAnalysis });
  } catch (error) {
    console.error('[RESUME] Error parsing resume:', error);
    console.error('[RESUME] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({ 
      error: 'Failed to parse resume', 
      message: error.message || 'Unknown error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Store feedback in memory (in production, you'd want to use a database)
const feedbackStore = [];

// POST /api/feedback - Submit user feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { sessionId, satisfaction, workingWell, improvements, categories, additional, timestamp } = req.body;
    
    if (!satisfaction) {
      return res.status(400).json({ error: 'Satisfaction level is required' });
    }
    
    const feedback = {
      id: Date.now().toString(),
      sessionId: sessionId || 'anonymous',
      satisfaction: satisfaction,
      workingWell: workingWell || '',
      improvements: improvements || '',
      categories: categories || [],
      additional: additional || '',
      timestamp: timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    
    feedbackStore.push(feedback);
    
    // Log feedback for visibility (detailed)
    console.log('\n========== NEW FEEDBACK RECEIVED ==========');
    console.log(`Satisfaction: ${feedback.satisfaction}`);
    console.log(`Session ID: ${feedback.sessionId}`);
    if (feedback.workingWell) {
      console.log(`What's Working: ${feedback.workingWell.substring(0, 100)}${feedback.workingWell.length > 100 ? '...' : ''}`);
    }
    if (feedback.improvements) {
      console.log(`Improvements: ${feedback.improvements.substring(0, 100)}${feedback.improvements.length > 100 ? '...' : ''}`);
    }
    if (feedback.categories.length > 0) {
      console.log(`Categories Requested: ${feedback.categories.join(', ')}`);
    }
    if (feedback.additional) {
      console.log(`Additional: ${feedback.additional.substring(0, 100)}${feedback.additional.length > 100 ? '...' : ''}`);
    }
    console.log(`Timestamp: ${feedback.createdAt}`);
    console.log('==========================================\n');
    
    res.json({ 
      success: true, 
      message: 'Feedback submitted successfully',
      feedbackId: feedback.id
    });
  } catch (error) {
    console.error('[FEEDBACK] Error processing feedback:', error);
    res.status(500).json({ 
      error: 'Failed to process feedback', 
      message: error.message || 'Unknown error occurred'
    });
  }
});

// GET /api/feedback - Get all feedback (for admin/viewing)
app.get('/api/feedback', (req, res) => {
  try {
    // Calculate summary statistics
    const satisfactionCounts = {
      'very-satisfied': 0,
      'satisfied': 0,
      'neutral': 0,
      'dissatisfied': 0,
      'very-dissatisfied': 0
    };
    
    const categoryCounts = {};
    
    feedbackStore.forEach(fb => {
      if (fb.satisfaction) {
        satisfactionCounts[fb.satisfaction] = (satisfactionCounts[fb.satisfaction] || 0) + 1;
      }
      if (fb.categories && Array.isArray(fb.categories)) {
        fb.categories.forEach(cat => {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
      }
    });
    
    res.json({
      success: true,
      count: feedbackStore.length,
      summary: {
        satisfaction: satisfactionCounts,
        topCategories: Object.entries(categoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([category, count]) => ({ category, count }))
      },
      feedback: feedbackStore
    });
  } catch (error) {
    console.error('[FEEDBACK] Error retrieving feedback:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve feedback', 
      message: error.message || 'Unknown error occurred'
    });
  }
});

// POST /api/tts - Text-to-speech using OpenAI TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voicePreference } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Map voice preference to OpenAI voice
    // OpenAI voices: alloy, echo, fable, onyx, nova, shimmer
    // Male-sounding: alloy, echo, onyx
    // Female-sounding: fable, nova, shimmer
    let voice = "alloy"; // Default
    if (voicePreference === "male") {
      voice = "onyx"; // Deep, male-sounding voice
    } else if (voicePreference === "female") {
      voice = "nova"; // Clear, female-sounding voice
    } else {
      // Auto mode: randomly alternate between male and female
      const randomChoice = Math.random() < 0.5 ? "male" : "female";
      voice = randomChoice === "male" ? "onyx" : "nova";
    }

    console.log(`Generating TTS for text: "${text.substring(0, 50)}..." with voice: ${voice} (preference: ${voicePreference || 'default'})`);

    const response = await openai.audio.speech.create({
      model: "tts-1-hd", // High quality, or use "tts-1" for faster/cheaper
      voice: voice, // alloy, echo, fable, onyx, nova, shimmer
      input: text
    });

    // Convert the response to buffer
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`Generated audio buffer, size: ${audioBuffer.byteLength} bytes`);
    
    res.setHeader('Content-Type', 'audio/mp3');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error with OpenAI TTS:', error);
    res.status(500).json({ error: 'TTS failed', message: error.message });
  }
});

// POST /api/research-city - Research city-specific information for personalized questions
app.post('/api/research-city', async (req, res) => {
  try {
    const { country, stateProvince, city, jobType, departmentName } = req.body;

    if (!country || !city || !jobType || !departmentName) {
      return res.status(400).json({ error: 'Missing required fields: country, city, jobType, departmentName' });
    }

    const locationString = stateProvince 
      ? `${city}, ${stateProvince}, ${country}`
      : `${city}, ${country}`;

    console.log(`Researching city information for: ${locationString}, ${jobType}, ${departmentName}`);

    // Perform actual web searches for critical facts using OpenAI's web search capability
    console.log('Performing web searches for current information...');
    
    // Reduced to most critical searches only (5 instead of 17) for speed
    // Run in parallel batches to speed up significantly
    const criticalSearches = [
      { query: `current fire chief ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'fire chief name' },
      { query: `current mayor ${city} ${stateProvince || ''} ${country} 2024 2025`, fact: 'mayor name' },
      { query: `${departmentName} union number ${city} ${country}`, fact: 'union number' },
      { query: `${departmentName} number of fire stations ${city} ${country} 2024 2025`, fact: 'number of fire stations' },
      { query: `${departmentName} number of members staff ${city} ${country} 2024 2025`, fact: 'number of members' }
    ];

    let verifiedFacts = {};
    
    console.log(`\n=== Starting ${criticalSearches.length} web searches (optimized, parallel batches) ===`);
    console.log(`Researching: ${locationString}, ${departmentName}\n`);
    
    // Process searches in parallel batches for speed (2 at a time)
    const processSearch = async (search) => {
      try {
        let factResult = null;
        let usedWebSearch = false;
        
        try {
          // Try Responses API with web_search tool for real-time information
          if (openai.responses && typeof openai.responses.create === 'function') {
            const searchResponse = await openai.responses.create({
              model: "gpt-4o",
              tools: [{ type: "web_search" }],
              input: `What is the current, verified fact for: "${search.query}"? Return ONLY the fact itself (name or number), no explanations.`
            });
            
            if (searchResponse && searchResponse.output_text) {
              factResult = searchResponse.output_text.trim();
              usedWebSearch = true;
            }
          }
        } catch (responsesError) {
          // Fallback to chat completions
        }
        
        // Fallback to chat completions if Responses API not available
        if (!factResult) {
          const searchResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a fact-checker. Provide the MOST CURRENT information. Return ONLY the fact itself (name or number), no explanations. If uncertain, return "NOT FOUND".`
              },
              {
                role: "user",
                content: `What is the current fact for "${search.query}"? Return ONLY the fact (name or number). If you cannot provide a current, verified fact, return "NOT FOUND".`
              }
            ],
            temperature: 0.1,
            max_tokens: 50
          });
          
          factResult = searchResponse.choices[0].message.content.trim();
        }
        
        // Clean up the response
        factResult = factResult.split('\n')[0].split('.')[0].trim();
        factResult = factResult.replace(/^["']|["']$/g, '');
        
        if (factResult && 
            factResult !== 'NOT FOUND' && 
            !factResult.toLowerCase().includes('not found') &&
            !factResult.toLowerCase().includes('outdated') &&
            !factResult.toLowerCase().includes('uncertain') &&
            factResult.length > 0 &&
            factResult.length < 100) {
          verifiedFacts[search.fact] = factResult;
          console.log(`✓ Found ${search.fact}: ${factResult}`);
          return { success: true, fact: search.fact, result: factResult };
        } else {
          console.log(`✗ Could not verify ${search.fact}`);
          return { success: false, fact: search.fact };
        }
      } catch (err) {
        console.error(`✗ ERROR for ${search.fact}:`, err.message);
        return { success: false, fact: search.fact, error: err.message };
      }
    };
    
    // Process in parallel batches of 2 for speed
    const batchSize = 2;
    for (let i = 0; i < criticalSearches.length; i += batchSize) {
      const batch = criticalSearches.slice(i, i + batchSize);
      await Promise.all(batch.map(processSearch));
    }
    
    console.log(`\n=== Completed all ${criticalSearches.length} searches ===`);
    console.log(`Successfully verified ${Object.keys(verifiedFacts).length} facts\n`);
    
    // Format verified facts by category for better organization
    const formatVerifiedFacts = (facts) => {
      const categories = {
        'leadership': [],
        'union': [],
        'department_size': [],
        'city_info': [],
        'history': [],
        'programs': [],
        'equipment': [],
        'other': []
      };
      
      Object.entries(facts).forEach(([key, value]) => {
        if (key.includes('chief') || key.includes('mayor') || key.includes('committee')) {
          categories.leadership.push(`${key}: ${value}`);
        } else if (key.includes('union')) {
          categories.union.push(`${key}: ${value}`);
        } else if (key.includes('number') || key.includes('members') || key.includes('stations') || key.includes('budget')) {
          categories.department_size.push(`${key}: ${value}`);
        } else if (key.includes('population') || key.includes('industries')) {
          categories.city_info.push(`${key}: ${value}`);
        } else if (key.includes('established') || key.includes('history')) {
          categories.history.push(`${key}: ${value}`);
        } else if (key.includes('programs') || key.includes('mission')) {
          categories.programs.push(`${key}: ${value}`);
        } else if (key.includes('equipment') || key.includes('capabilities')) {
          categories.equipment.push(`${key}: ${value}`);
        } else {
          categories.other.push(`${key}: ${value}`);
        }
      });
      
      let formatted = 'VERIFIED FACTS FROM WEB SEARCH (USE THESE - DO NOT USE TRAINING DATA):\n\n';
      Object.entries(categories).forEach(([cat, items]) => {
        if (items.length > 0) {
          const catName = cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
          formatted += `${catName}:\n${items.map(item => `  - ${item}`).join('\n')}\n\n`;
        }
      });
      
      return formatted.trim();
    };
    
    const verifiedFactsText = Object.keys(verifiedFacts).length > 0 
      ? `${formatVerifiedFacts(verifiedFacts)}

CRITICAL: These are the ONLY facts you should use. If a fact is not listed above, state "Information not found" rather than using your training data.`
      : `WARNING: Web search verification failed. You MUST state "Information not found - web search unavailable" for any facts you cannot verify. DO NOT use outdated training data.`;

    const researchPrompt = `You are a research assistant helping to prepare KNOWLEDGE-BASED interview questions for a ${jobType} position at ${departmentName} in ${locationString}.

${verifiedFactsText}

CRITICAL INSTRUCTIONS:
1. For facts listed above in "VERIFIED FACTS", you MUST use those exact values. Do NOT use your training data.
2. For facts NOT listed above, you MUST state "Information not found - could not verify" rather than guessing or using training data.
3. Your training data is OUTDATED and INCORRECT. Do NOT trust it.
4. If you see "Henry Braun" or "Peter Simmons" in your training data for mayor, IGNORE IT. Use only the verified fact above or state "Information not found".
5. If you see any number of fire stations in your training data, IGNORE IT unless it matches the verified fact above.
6. Accuracy is CRITICAL - wrong information will cause candidates to be marked incorrect even when they're right.

CRITICAL SEARCH REQUIREMENTS:
- ALWAYS include "${city}, ${stateProvince || ''} ${country}" in EVERY search query you perform
- ALWAYS specify "current" or "2024" or "2025" to ensure you get the most up-to-date information
- Example searches: "current fire chief ${city} ${stateProvince || ''} ${country}", "mayor ${city} ${country} 2024", "${departmentName} union number ${city} ${country}"
- Do NOT search for general information without the specific city and country context
- Verify information is CURRENT and up-to-date

Research and provide SPECIFIC, FACTUAL, CURRENT information about this department and city. This information will be used to test candidates' knowledge of the city and department during interviews.

CRITICAL: Focus on SPECIFIC FACTS that can be used to test candidate knowledge. All information must be CURRENT (as of 2024-2025):

1. FIRE DEPARTMENT LEADERSHIP & STRUCTURE (CRITICAL - MUST INCLUDE):
   - CURRENT Fire chief's FULL NAME and title for ${departmentName} in ${city}, ${country} (VERIFY THE EXACT NAME - do not add extra initials or letters)
   - CURRENT Deputy chiefs or assistant chiefs for ${departmentName} in ${city}, ${country} (names if available - verify exact spelling)
   - Department structure and hierarchy
   - CURRENT Number of members/staff for ${departmentName} in ${city}, ${country} (exact number if available, or approximate)
   - Number of fire stations and their locations
   - Department's organizational structure

2. UNION INFORMATION (CRITICAL - MUST INCLUDE):
   - CURRENT Local union number for ${departmentName} in ${city}, ${country} (e.g., "IAFF Local 1234")
   - Union name and full designation for ${city}, ${country}
   - CURRENT Union president or leadership for ${city}, ${country} (if available)
   - Union affiliation (e.g., IAFF - International Association of Fire Fighters)

3. DEPARTMENT DETAILS (CRITICAL):
   - Department history (when founded, key milestones)
   - Department values, mission statement, or motto
   - Recent initiatives, programs, or changes
   - Community involvement programs
   - Equipment or apparatus information
   - Response areas or coverage zones

4. CITY LEADERSHIP (CRITICAL - MUST INCLUDE):
   - CURRENT Mayor's FULL NAME for ${city}, ${country} (VERIFY THE EXACT NAME - do not add extra initials or letters)
   - CURRENT Mayor's key priorities for ${city}, ${country}, especially related to emergency services
   - CURRENT City council members for ${city}, ${country} (especially those on public safety committees)
   - CURRENT City manager or chief administrative officer for ${city}, ${country}

5. CITY INFORMATION:
   - City demographics and population
   - Major industries or economic drivers
   - Unique challenges facing the city (that affect fire department)
   - City planning initiatives
   - Emergency services structure (how fire fits with police, EMS)
   - Recent city developments or growth

6. DEPARTMENT-SPECIFIC CONTEXT:
   - How the department fits into the city's emergency services
   - Department's role in the community
   - Any unique aspects, challenges, or strengths of this specific department
   - Department's relationship with city government

CRITICAL ACCURACY REQUIREMENTS: 
- You MUST perform web searches to verify ALL information. Do NOT rely on training data - it may be outdated or incorrect.
- For EVERY fact, search the web with queries like:
  * "current fire chief ${city} ${stateProvince || ''} ${country} 2024"
  * "${departmentName} number of fire stations ${city} ${country} 2024"
  * "mayor ${city} ${country} 2024"
  * "${departmentName} union number ${city} ${country}"
- Provide SPECIFIC NAMES, NUMBERS, and FACTS only after verifying them through web search
- For names: Use EXACT names as they appear in official sources. Do NOT add extra initials, letters, or characters (e.g., if you see "Erick Peterson", use exactly that - do not add "B. R. H." or other letters)
- For numbers: VERIFY with web search. If your training data says "5 fire stations", you MUST search to confirm this is correct for ${city}, ${country} in 2024-2025.
- Verify all names and numbers before including them - check spelling and do not add extra characters
- If information is not available after web search, clearly state "Information not found" for that specific item
- Focus on information that would be publicly available and that a well-prepared candidate should know
- Format clearly with headings so specific facts can be easily extracted for knowledge-testing questions
- This research will be used to generate questions that TEST the candidate's knowledge, not behavioral questions
- Accuracy is ESSENTIAL - incorrect information will cause candidates to be marked wrong even when they give correct answers
- If you cannot verify a fact through web search, state "Information not found" rather than guessing

Provide a structured summary (400-600 words) with clear sections for each category above.`;

    // Use OpenAI with web browsing capability to get real-time, accurate information
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a research assistant that provides ACCURATE, VERIFIABLE, CURRENT information about fire departments, police departments, and emergency services.

CRITICAL: Your training data is OUTDATED and UNRELIABLE. You MUST use ONLY the verified facts provided in the user's message. 

ABSOLUTE RULES:
1. If a verified fact is provided (e.g., "mayor name: [name]"), you MUST use that exact fact. Do NOT use your training data.
2. If a verified fact is NOT provided, you MUST state "Information not found - could not verify" rather than using your training data.
3. Your training data contains OUTDATED information (e.g., "Henry Braun" as mayor - this is WRONG). IGNORE IT.
4. Do NOT add extra initials, letters, or characters to names.
5. Do NOT guess numbers (like "5 fire stations") - only use verified numbers or state "Information not found".
6. Accuracy is CRITICAL - wrong information will cause candidates to be marked incorrect even when they're right.

Your ONLY job is to use the verified facts provided. If a fact is not verified, state "Information not found".`
        },
        {
          role: "user",
          content: researchPrompt + `\n\nIMPORTANT: Before providing any information, perform web searches to verify each fact. Do NOT rely on your training data - it may be outdated. Search for:
- "current fire chief ${city} ${stateProvince || ''} ${country} 2024"
- "mayor ${city} ${country} 2024"
- "${departmentName} union number ${city} ${country}"
- "${departmentName} number of fire stations ${city} ${country} 2024"
- "${departmentName} number of members ${city} ${country} 2024"
- Any other specific facts you need to verify

Only include information that you can verify through web search. If you cannot find current information, state "Information not found" for that specific item.`
        }
      ],
      temperature: 0.1, // Very low temperature for maximum accuracy
      max_tokens: 1500
    });

    const research = response.choices[0].message.content;

    res.json({
      success: true,
      research: research,
      location: locationString,
      departmentName: departmentName,
      jobType: jobType
    });
  } catch (error) {
    console.error('Error researching city:', error);
    res.status(500).json({ error: 'Failed to research city information', message: error.message });
  }
});

// Simple in-memory cache for location searches (expires after 1 hour)
const locationCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// User profiles - stores comprehensive user information for personalized questions
// In production, this would be stored in a database (e.g., MongoDB, PostgreSQL)
// For now, using in-memory storage with session-based keys
const userProfiles = new Map();

// Helper function to get or create user profile
function getUserProfile(sessionId) {
  if (!userProfiles.has(sessionId)) {
    userProfiles.set(sessionId, {
      sessionId: sessionId,
      name: null,
      city: null,
      stateProvince: null,
      country: null,
      departmentName: null,
      jobType: null,
      voicePreference: null,
      resumeText: null,
      resumeAnalysis: null,
      cityResearch: null,
      conversationHistory: [],
      askedQuestions: [],
      askedCategories: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return userProfiles.get(sessionId);
}

// Helper function to update user profile
function updateUserProfile(sessionId, updates) {
  const profile = getUserProfile(sessionId);
  Object.assign(profile, updates, { updatedAt: new Date().toISOString() });
  return profile;
}

// Load comprehensive country/state/city data from countries-states-cities-database
// Using the public JSON files from: https://github.com/dr5hn/countries-states-cities-database
let countriesData = null;
let statesData = null;
let citiesData = null;

// Load data on startup (lightweight, fast)
async function loadLocationData() {
  try {
    // Use GitHub raw content URLs - more reliable than npm CDN
    // The files are in the json/ directory of the repository
    const baseUrl = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json';
    
    console.log('Loading location data from countries-states-cities-database...');
    
    // Helper function to fetch with timeout
    const fetchWithTimeout = (url, options, timeout = 30000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      return fetchModule(url, {
        ...options,
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));
    };
    
    const [countriesRes, statesRes, citiesRes] = await Promise.allSettled([
      fetchWithTimeout(`${baseUrl}/countries.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }, 30000),
      fetchWithTimeout(`${baseUrl}/states.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }, 30000),
      fetchWithTimeout(`${baseUrl}/cities.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }, 60000) // Cities file is larger, allow more time
    ]);
    
    // Handle results - allow partial success
    const countriesResult = countriesRes.status === 'fulfilled' ? countriesRes.value : null;
    const statesResult = statesRes.status === 'fulfilled' ? statesRes.value : null;
    const citiesResult = citiesRes.status === 'fulfilled' ? citiesRes.value : null;
    
    // Check if responses are OK (cities can fail, that's okay)
    if (!countriesResult || !countriesResult.ok) {
      throw new Error(`Failed to load countries: ${countriesResult?.status || 'network error'}`);
    }
    if (!statesResult || !statesResult.ok) {
      throw new Error(`Failed to load states: ${statesResult?.status || 'network error'}`);
    }
    // Cities can fail - we'll just log it and continue
    if (!citiesResult || !citiesResult.ok) {
      console.warn(`Cities data not available (status: ${citiesResult?.status || 'network error'}) - will use Nominatim for city searches`);
    }
    
    // Get text first to check if it's actually JSON
    const [countriesText, statesText, citiesText] = await Promise.all([
      countriesResult.text(),
      statesResult.text(),
      citiesResult && citiesResult.ok ? citiesResult.text() : Promise.resolve('[]')
    ]);
    
    // Check if we got HTML (error page) instead of JSON
    if (countriesText.trim().startsWith('<') || statesText.trim().startsWith('<')) {
      throw new Error('Received HTML instead of JSON (likely an error page)');
    }
    if (citiesText && citiesText.trim().startsWith('<')) {
      console.warn('Cities data returned HTML - will use Nominatim for city searches');
    }
    
    // Parse JSON
    countriesData = JSON.parse(countriesText);
    statesData = JSON.parse(statesText);
    if (citiesResult && citiesResult.ok && citiesText && !citiesText.trim().startsWith('<')) {
      citiesData = JSON.parse(citiesText);
      console.log(`✓ Loaded ${countriesData.length} countries, ${statesData.length} states, ${citiesData.length} cities`);
    } else {
      citiesData = null;
      console.log(`✓ Loaded ${countriesData.length} countries, ${statesData.length} states (cities will use Nominatim)`);
    }
  } catch (error) {
    console.error('Failed to load location data, falling back to static lists:', error.message || error);
    // Fall back to static lists if API fails - this is non-critical
    countriesData = null;
    statesData = null;
    citiesData = null;
  }
}

// Load data on server start
// DISABLED: Old map data loading - no longer using countries-states-cities-database
// loadLocationData();

// Static lists for instant results (fallback if API data not loaded yet)
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
  'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
  'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

const CANADIAN_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
  'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
  'Quebec', 'Saskatchewan', 'Yukon'
];

// Common cities by state/province (for instant results)
const COMMON_CITIES = {
  'California': ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'San Jose', 'Oakland', 'Fresno', 'Long Beach'],
  'Texas': ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth', 'El Paso', 'Arlington', 'Corpus Christi'],
  'Florida': ['Miami', 'Tampa', 'Orlando', 'Jacksonville', 'Fort Lauderdale', 'Tallahassee', 'St. Petersburg', 'Hialeah'],
  'New York': ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Syracuse', 'Yonkers', 'Utica', 'New Rochelle'],
  'Illinois': ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Elgin', 'Springfield', 'Peoria'],
  'Pennsylvania': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading', 'Scranton', 'Bethlehem', 'Lancaster'],
  'Ohio': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Parma', 'Canton'],
  'British Columbia': ['Vancouver', 'Victoria', 'Surrey', 'Burnaby', 'Richmond', 'Abbotsford', 'Coquitlam', 'Kelowna'],
  'Ontario': ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London', 'Markham', 'Windsor'],
  'Alberta': ['Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert', 'Medicine Hat', 'Grande Prairie', 'Airdrie'],
  'Quebec': ['Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil', 'Sherbrooke', 'Saguenay', 'Levis']
};

// Helper function to search comprehensive location database (instant results)
function searchLocationDatabase(query, type, country, stateProvince) {
  const queryLower = query.toLowerCase();
  let results = [];
  
  if (type === 'state') {
    // Search states/provinces
    let filteredStates = statesData || [];
    
    // Filter by country if specified
    if (country && countriesData) {
      const countryObj = countriesData.find(c => 
        c.name.toLowerCase() === country.toLowerCase() || 
        c.name === country
      );
      if (countryObj) {
        filteredStates = filteredStates.filter(state => 
          state.country_id === countryObj.id
        );
      }
    }
    
    results = filteredStates
      .filter(state => {
        const stateName = (state.name || '').toLowerCase();
        // Strict check: must actually contain the query string
        const contains = stateName.includes(queryLower);
        if (!contains) {
          return false;
        }
        // Debug: log matches
        if (queryLower === 'br') {
          console.log(`  Checking "${stateName}" for "br": ${contains ? 'MATCH' : 'NO MATCH'}`);
        }
        return true;
      })
      .map(state => {
        const stateName = state.name || '';
        const stateLower = stateName.toLowerCase();
        let relevance = 3;
        if (stateLower.startsWith(queryLower)) {
          relevance = 1; // Highest priority: starts with query
        } else if (stateLower.includes(queryLower)) {
          relevance = 2; // Medium priority: contains query
        } else {
          // This shouldn't happen due to filter, but just in case
          return null;
        }
        
        // Get country name
        let countryName = country || 'Unknown';
        if (countriesData && state.country_id) {
          const countryObj = countriesData.find(c => c.id === state.country_id);
          if (countryObj) {
            countryName = countryObj.name;
          }
        }
        
        return {
          name: stateName,
          country: countryName,
          fullLocation: `${stateName}, ${countryName}`,
          relevance: relevance
        };
      })
      .filter(item => item !== null) // Remove any null items
      .sort((a, b) => {
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, prioritize shorter names (more specific matches)
        if (a.name.length !== b.name.length) {
          return a.name.length - b.name.length;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        const { relevance, ...clean } = item;
        return clean;
      });
      
  } else if (type === 'city') {
    // Search cities
    let filteredCities = citiesData || [];
    
    // Filter by state/province if specified
    if (stateProvince && statesData) {
      const stateObj = statesData.find(s => 
        (s.name || '').toLowerCase() === stateProvince.toLowerCase()
      );
      if (stateObj) {
        filteredCities = filteredCities.filter(city => 
          city.state_id === stateObj.id
        );
      }
    }
    
    // Filter by country if specified (and no state filter)
    if (country && !stateProvince && countriesData) {
      const countryObj = countriesData.find(c => 
        c.name.toLowerCase() === country.toLowerCase() || 
        c.name === country
      );
      if (countryObj && statesData) {
        const countryStates = statesData.filter(s => s.country_id === countryObj.id);
        const countryStateIds = new Set(countryStates.map(s => s.id));
        filteredCities = filteredCities.filter(city => 
          countryStateIds.has(city.state_id)
        );
      }
    }
    
    results = filteredCities
      .filter(city => {
        const cityName = (city.name || '').toLowerCase();
        return cityName.includes(queryLower);
      })
      .map(city => {
        const cityName = city.name || '';
        const cityLower = cityName.toLowerCase();
        let relevance = 3;
        if (cityLower.startsWith(queryLower)) {
          relevance = 1;
        } else if (cityLower.includes(queryLower)) {
          relevance = 2;
        }
        
        // Get state and country names
        let stateName = stateProvince || '';
        let countryName = country || 'Unknown';
        
        if (statesData && city.state_id) {
          const stateObj = statesData.find(s => s.id === city.state_id);
          if (stateObj) {
            stateName = stateObj.name || '';
            
            if (countriesData && stateObj.country_id) {
              const countryObj = countriesData.find(c => c.id === stateObj.country_id);
              if (countryObj) {
                countryName = countryObj.name;
              }
            }
          }
        }
        
        return {
          name: cityName,
          stateProvince: stateName,
          country: countryName,
          fullLocation: [cityName, stateName, countryName].filter(Boolean).join(', '),
          relevance: relevance
        };
      })
      .sort((a, b) => {
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, prioritize shorter names (more specific matches)
        if (a.name.length !== b.name.length) {
          return a.name.length - b.name.length;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        const { relevance, ...clean } = item;
        return clean;
      });
  }
  
  return results;
}

// Fallback function using static lists (if database not loaded)
function searchStaticList(query, type, country) {
  const queryLower = query.toLowerCase();
  let results = [];
  
  // Skip static lists for non-US/Canada countries - let them fall through to Nominatim
  if (country && country !== 'United States' && country !== 'Canada') {
    return []; // Return empty to fall through to Nominatim
  }
  
  if (type === 'state') {
    let list = [];
    if (country === 'United States') {
      list = US_STATES;
    } else if (country === 'Canada') {
      list = CANADIAN_PROVINCES;
    } else {
      // If no country specified, search both US and Canada
      list = [...US_STATES, ...CANADIAN_PROVINCES];
    }
    
    results = list
      .filter(state => {
        const stateLower = state.toLowerCase();
        // Strict check: must actually contain the query string
        const contains = stateLower.includes(queryLower);
        if (!contains) {
          return false;
        }
        // Debug logging for "br" query
        if (queryLower === 'br' && country === 'Canada') {
          console.log(`  Filter: "${state}" (${stateLower}) contains "br": ${contains}`);
        }
        return true;
      })
      .map(state => {
        const stateLower = state.toLowerCase();
        let relevance = 3;
        if (stateLower.startsWith(queryLower)) {
          relevance = 1; // Highest priority: starts with query
        } else if (stateLower.includes(queryLower)) {
          relevance = 2; // Medium priority: contains query
        }
        // Debug logging for "br" query
        if (queryLower === 'br' && country === 'Canada') {
          console.log(`  Map: "${state}" -> relevance ${relevance}`);
        }
        return {
          name: state,
          country: US_STATES.includes(state) ? 'United States' : 'Canada',
          fullLocation: `${state}, ${US_STATES.includes(state) ? 'United States' : 'Canada'}`,
          relevance: relevance
        };
      })
      .sort((a, b) => {
        // Sort by relevance first (1 = best, 2 = good, 3 = ok)
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, prioritize shorter names (more specific matches)
        if (a.name.length !== b.name.length) {
          return a.name.length - b.name.length;
        }
        // If same length, sort alphabetically
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        // Remove relevance before returning
        const { relevance, ...clean } = item;
        return clean;
      });
  } else if (type === 'city') {
    // Search common cities (only for US/Canada)
    const allCities = [];
    Object.entries(COMMON_CITIES).forEach(([state, cities]) => {
      cities.forEach(city => {
        allCities.push({ city, state, country: US_STATES.includes(state) ? 'United States' : 'Canada' });
      });
    });
    
    results = allCities
      .filter(item => {
        const cityLower = item.city.toLowerCase();
        const matchesQuery = cityLower.includes(queryLower);
        // Only match if country is US/Canada or not specified
        const matchesCountry = !country || item.country === country;
        return matchesQuery && matchesCountry;
      })
      .map(item => {
        const cityLower = item.city.toLowerCase();
        let relevance = 3;
        if (cityLower.startsWith(queryLower)) {
          relevance = 1; // Highest priority: starts with query
        } else if (cityLower.includes(queryLower)) {
          relevance = 2; // Medium priority: contains query
        }
        return {
          name: item.city,
          stateProvince: item.state,
          country: item.country,
          fullLocation: `${item.city}, ${item.state}, ${item.country}`,
          relevance: relevance
        };
      })
      .sort((a, b) => {
        // Sort by relevance first (1 = best, 2 = good, 3 = ok)
        if (a.relevance !== b.relevance) {
          return a.relevance - b.relevance;
        }
        // If same relevance, sort alphabetically
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8)
      .map(item => {
        // Remove relevance before returning
        const { relevance, ...clean } = item;
        return clean;
      });
  }
  
  return results;
}

// POST /api/search-location - Location search with static lists (instant) + Nominatim fallback
app.post('/api/search-location', async (req, res) => {
  try {
    const { query, type, country, stateProvince } = req.body; // type: 'city' or 'state'

    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const queryLower = query.toLowerCase();
    
    // ALWAYS use static lists FIRST (instant, no loading time, covers US/Canada)
    console.log(`Searching for ${type} with query: "${query}"${country ? ` in ${country}` : ''}`);
    let searchResults = searchStaticList(query, type, country);
    
    // For cities, filter by state/province if provided
    if (type === 'city' && stateProvince && searchResults.length > 0) {
      searchResults = searchResults.filter(item => 
        item.stateProvince && item.stateProvince.toLowerCase() === stateProvince.toLowerCase()
      );
    }
    
    console.log(`✓ Static list: ${searchResults.length} results for "${query}" (${type})`);
    if (searchResults.length > 0) {
      console.log(`  Results: ${searchResults.map(r => r.name).join(', ')}`);
      return res.json({ suggestions: searchResults });
    }
    
    // Only if static list has no results, try comprehensive database (if loaded)
    if (countriesData && statesData && citiesData) {
      console.log(`Static list empty, trying database for "${query}" (${type})`);
      searchResults = searchLocationDatabase(query, type, country, stateProvince);
      if (searchResults.length > 0) {
        console.log(`✓ Database search: ${searchResults.length} results`);
        return res.json({ suggestions: searchResults });
      }
    }
    
    // Only check cache for Nominatim results (not static - those are always instant)
    const cacheKey = `${type}:${queryLower}:${country || ''}:${stateProvince || ''}`;
    const cached = locationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`Cache hit for: ${cacheKey}`);
      return res.json({ suggestions: cached.data });
    }

    console.log(`Static list empty, searching Nominatim for ${type} with query: "${query}"${country ? ` in ${country}` : ''}`);

    // Use OpenStreetMap Nominatim API (free, no API key required)
    // Documentation: https://nominatim.org/release-docs/develop/api/Search/
    
    let searchQuery = query;
    
    if (type === 'city') {
      // Optimize: search for cities/towns/villages, prioritize by state and country
      if (stateProvince && country) {
        searchQuery = `${query}, ${stateProvince}, ${country}`;
      } else if (stateProvince) {
        searchQuery = `${query}, ${stateProvince}`;
      } else if (country) {
        searchQuery = `${query}, ${country}`;
      }
    } else if (type === 'state') {
      // Optimize: search for states/provinces, prioritize by country
      if (country) {
        searchQuery = `${query}, ${country}`;
      }
    } else {
      return res.status(400).json({ error: 'Invalid type. Must be "city" or "state"' });
    }

    // Build Nominatim API URL with optimized parameters
    const baseUrl = 'https://nominatim.openstreetmap.org/search';
    const params = new URLSearchParams({
      q: searchQuery,
      format: 'json',
      addressdetails: '1',
      limit: '8',
      dedupe: '1', // Remove duplicates
      'accept-language': 'en',
      namedetails: '0', // Don't need named details for speed
      extratags: '0' // Don't need extra tags for speed
    });
    
    // Add feature type filter for better results (but don't use it if it slows things down)
    if (type === 'city') {
      // Prioritize cities/towns
      params.append('featuretype', 'city,town,village');
    } else if (type === 'state') {
      params.append('featuretype', 'state,province');
    }

    const url = `${baseUrl}?${params.toString()}`;
    
    console.log(`Calling Nominatim API: ${url}`);

    // Call Nominatim API with proper headers (required by their usage policy)
    // Add timeout to prevent hanging (increased to 15 seconds for reliability)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      const response = await fetchModule(url, {
        headers: {
          'User-Agent': 'FireInterviewCoach/1.0 (contact: support@fireinterviewcoach.com)', // Required by Nominatim
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const data = await response.json();
    
    // Transform Nominatim results to our format
    const queryLower = query.toLowerCase();
    const suggestions = data.map(item => {
      const address = item.address || {};
      
      if (type === 'city') {
        const cityName = address.city || address.town || address.village || address.municipality || item.display_name.split(',')[0];
        const stateProvince = address.state || address.province || address.region || '';
        const countryName = address.country || '';
        
        return {
          name: cityName,
          stateProvince: stateProvince,
          country: countryName,
          fullLocation: [cityName, stateProvince, countryName].filter(Boolean).join(', '),
          relevance: cityName.toLowerCase().startsWith(queryLower) ? 1 : (cityName.toLowerCase().includes(queryLower) ? 2 : 3)
        };
      } else {
        // type === 'state'
        const stateName = address.state || address.province || address.region || item.display_name.split(',')[0];
        const countryName = address.country || '';
        
        // Calculate relevance score (lower is better)
        const stateLower = stateName.toLowerCase();
        let relevance = 3; // Default: low relevance
        if (stateLower.startsWith(queryLower)) {
          relevance = 1; // Exact start match - highest priority
        } else if (stateLower.includes(queryLower)) {
          relevance = 2; // Contains query - medium priority
        }
        
        return {
          name: stateName,
          country: countryName,
          fullLocation: [stateName, countryName].filter(Boolean).join(', '),
          relevance: relevance
        };
      }
    }).filter(item => {
      // Filter by country if specified
      if (country && item.country) {
        const countryMatch = item.country.toLowerCase().includes(country.toLowerCase()) || 
                            country.toLowerCase().includes(item.country.toLowerCase());
        if (!countryMatch) return false;
      }
      
      // Filter by state/province if specified (for cities)
      if (type === 'city' && stateProvince && item.stateProvince) {
        const stateMatch = item.stateProvince.toLowerCase().includes(stateProvince.toLowerCase()) ||
                          stateProvince.toLowerCase().includes(item.stateProvince.toLowerCase());
        if (!stateMatch) return false;
      }
      
      // Filter out results that don't match the query at all
      const nameLower = item.name.toLowerCase();
      if (!nameLower.includes(queryLower)) {
        return false;
      }
      
      return true;
    }).sort((a, b) => {
      // Sort by relevance (lower number = more relevant)
      if (a.relevance !== b.relevance) {
        return a.relevance - b.relevance;
      }
      // If same relevance, sort alphabetically
      return a.name.localeCompare(b.name);
    });

    // Limit to 8 suggestions and remove duplicates based on name and country
    const uniqueSuggestions = [];
    const seen = new Set();
    for (const suggestion of suggestions) {
      if (uniqueSuggestions.length >= 8) break; // Limit to 8 suggestions
      const key = `${suggestion.name}|${suggestion.country}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Remove relevance score before adding (it's only for sorting)
        const { relevance, ...cleanSuggestion } = suggestion;
        uniqueSuggestions.push(cleanSuggestion);
      }
    }

      console.log(`Returning ${uniqueSuggestions.length} suggestions for ${type} query: "${query}"`);
      
      // Cache the results
      locationCache.set(cacheKey, {
        data: uniqueSuggestions.slice(0, 8),
        timestamp: Date.now()
      });
      
      // Clean up old cache entries (keep cache under 1000 entries)
      if (locationCache.size > 1000) {
        const oldestKey = Array.from(locationCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        locationCache.delete(oldestKey);
      }
      
      res.json({ suggestions: uniqueSuggestions.slice(0, 8) });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Nominatim API timeout');
        throw new Error('Search timeout - please try again');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('Error searching location:', error);
    console.error('Error stack:', error.stack);
    // Return empty suggestions instead of error to prevent UI breakage
    res.json({ suggestions: [], error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🔥 Fire Interview Coach API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
