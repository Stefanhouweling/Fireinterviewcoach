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
      searchLocation: 'POST /api/search-location'
    },
    message: 'API is running. Use the endpoints above to interact with the service.'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Fire Interview Coach API is running' });
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
      resumeContext = `Resume Summary:
- Experience: ${analysis.experience || analysis.yearsOfExperience || "N/A"}
- Certifications: ${Array.isArray(analysis.certifications) ? analysis.certifications.join(", ") : "None listed"}
- Key Skills: ${Array.isArray(analysis.skills) ? analysis.skills.slice(0, 5).join(", ") : "General"}
- Work History Highlights: ${Array.isArray(analysis.workHistory) ? analysis.workHistory.slice(0, 3).join("; ") : "N/A"}
- Interview Focus Areas: ${Array.isArray(analysis.interviewFocus) ? analysis.interviewFocus.join(", ") : "General competencies"}

Full Resume Analysis: ${JSON.stringify(profileResumeAnalysis)}`;
    } else if (profileResumeText) {
      resumeContext = `Resume Text (full text for context):
${profileResumeText}`;
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
        userProfileContext += `\n\nIMPORTANT: The candidate's name is ${profileName}. Occasionally address them by name in questions to make it more personal and realistic (e.g., "${profileName}, tell us about a time..." or "${profileName}, how would you..."). Use the name naturally, not in every question - mix it in about 30% of the time.`;
      }
    }

    // Determine question strategy based on mode, with heavy emphasis on personalization
    let questionStrategy = "";
    const questionTypeToUse = questionType || (Math.random() < 0.5 ? 'behavioral' : 'situational');
    const difficultyToUse = difficulty || (() => {
      const rand = Math.random();
      if (rand < 0.3) return 'easy';
      if (rand < 0.7) return 'medium';
      return 'hard';
    })();
    
    // Initialize question bank reference (currently not used, but kept for future use)
    let questionBankReference = null;
    let bankReferenceText = "";
    
    // Build personalization context
    let personalizationContext = "";
    if (profileName) {
      personalizationContext += `\n- Candidate's name: ${profileName} (address them by name naturally in about 30-40% of questions)`;
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
      personalizationContext += `\n- Resume highlights: ${profileResumeAnalysis.experience || 'N/A'} experience, Certifications: ${Array.isArray(profileResumeAnalysis.certifications) ? profileResumeAnalysis.certifications.slice(0, 3).join(", ") : 'None'}, Key skills: ${Array.isArray(profileResumeAnalysis.skills) ? profileResumeAnalysis.skills.slice(0, 5).join(", ") : 'General'}`;
    }
    if (profileCityResearch) {
      personalizationContext += `\n- City/Department research available: Use specific details from this research to make questions feel authentic and personalized to this exact department and location.`;
    }
    
    if (practiceMode === "specific" && selectedCategory) {
      if (selectedCategory === "Resume-Based") {
        questionStrategy = `Generate a ${questionTypeToUse} question (${difficultyToUse} difficulty) SPECIFICALLY personalized to this candidate's resume and background.${personalizationContext}

CRITICAL PERSONALIZATION REQUIREMENTS:
- Reference their actual experience, certifications, or specific skills from their resume
- Use their name naturally (${profileName ? profileName : 'if provided'})
- Connect the question to their background while still testing general firefighter competencies
- Make it feel like the panel researched their resume and is asking a tailored question
- Example: If they have EMR certification, ask about a medical scenario. If they have construction experience, reference that in a safety question.

However, keep it general enough that it tests their judgment and understanding, not just their specific past. Mix resume-specific elements with general firefighter competencies.`;
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

QUESTION FORMAT EXAMPLES (USE THESE STYLES):
- "${profileName ? profileName + ', ' : ''}Who is the fire chief of ${profileDepartmentName || 'this department'}?"
- "What is the local union number for ${profileDepartmentName || 'the fire department'} in ${profileCity || 'this city'}?"
- "How many members does ${profileDepartmentName || 'the department'} currently have?"
- "Who is the mayor of ${profileCity || 'this city'}?"
- "Can you tell us about the history of ${profileDepartmentName || 'this department'}?"
- "What community programs does ${profileDepartmentName || 'this department'} participate in?"
- "When was ${profileDepartmentName || 'this department'} first established as a career department?"

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
- Use the candidate's name (${profileName ? profileName : 'if provided'}) naturally in about 30-40% of questions
- Reference their department "${profileDepartmentName || '[if provided]'}" when relevant
- Reference their city "${profileCity || '[if provided]'}" and use city research details when appropriate
- Reference their resume background (experience, certifications, skills) naturally when it fits
- Make it feel like a real panel member who has reviewed their application is asking

${questionTypeToUse === 'behavioral' ? 'Use "Tell us about a time..." format asking about past experience.' : 'Use "How would you handle..." format asking about a hypothetical situation.'} 

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
      bankReferenceText = `\n\nQUESTION BANK REFERENCE (use as inspiration, but create a NEW, PERSONALIZED question):
- Type: ${questionBankReference.type}
- Difficulty: ${questionBankReference.difficulty}
- Category: ${questionBankReference.category}
- Example question style: "${questionBankReference.question}"

IMPORTANT: Do NOT copy this question. Use it as inspiration for the TYPE and STYLE of question, but create a completely new, personalized question that incorporates the candidate's profile information above.`;
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
4. Reference their specific background naturally (experience, certifications, skills, department, city)
5. Address them by name when appropriate (about 30-40% of questions)
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
- If a name is provided, address them by name naturally (about 30-40% of the time)
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
    * "${profileName ? profileName + ', ' : ''}Who is the fire chief of ${profileDepartmentName || 'this department'}?"
    * "What is the local union number for ${profileDepartmentName || 'the fire department'} in ${profileCity || 'this city'}?"
    * "How many members does ${profileDepartmentName || 'the department'} currently have?"
    * "Who is the mayor of ${profileCity || 'this city'}?"
    * "When was ${profileDepartmentName || 'this department'} first established as a career department?"
    * "What community programs does ${profileDepartmentName || 'this department'} participate in?"
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
          content: "You are an expert at analyzing firefighter resumes. Extract structured information in JSON format."
        },
        {
          role: "user",
          content: `Analyze this firefighter resume and extract:
- Years of experience
- Certifications (EMR, POC, etc.)
- Specialized skills (medical, technical, leadership)
- Relevant work history
- Key achievements
- Areas that would be interesting for interview questions

Resume text (full text - analyze completely):
${resumeText}

Return a JSON object with this structure:
{
  "experience": "X years",
  "certifications": ["cert1", "cert2"],
  "skills": ["skill1", "skill2"],
  "workHistory": ["job1", "job2"],
  "achievements": ["achievement1"],
  "interviewFocus": ["area1", "area2"]
}`
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

    const researchPrompt = `You are a research assistant helping to prepare KNOWLEDGE-BASED interview questions for a ${jobType} position at ${departmentName} in ${locationString}.

Research and provide SPECIFIC, FACTUAL information about this department and city. This information will be used to test candidates' knowledge of the city and department during interviews.

CRITICAL: Focus on SPECIFIC FACTS that can be used to test candidate knowledge:

1. FIRE DEPARTMENT LEADERSHIP & STRUCTURE (CRITICAL - MUST INCLUDE):
   - Fire chief's FULL NAME and title (VERIFY THE EXACT NAME - do not add extra initials or letters)
   - Deputy chiefs or assistant chiefs (names if available - verify exact spelling)
   - Department structure and hierarchy
   - Number of members/staff (exact number if available, or approximate)
   - Number of fire stations and their locations
   - Department's organizational structure

2. UNION INFORMATION (CRITICAL - MUST INCLUDE):
   - Local union number for ${departmentName} (e.g., "IAFF Local 1234")
   - Union name and full designation
   - Union president or leadership (if available)
   - Union affiliation (e.g., IAFF - International Association of Fire Fighters)

3. DEPARTMENT DETAILS (CRITICAL):
   - Department history (when founded, key milestones)
   - Department values, mission statement, or motto
   - Recent initiatives, programs, or changes
   - Community involvement programs
   - Equipment or apparatus information
   - Response areas or coverage zones

4. CITY LEADERSHIP (CRITICAL - MUST INCLUDE):
   - Mayor's FULL NAME (VERIFY THE EXACT NAME - do not add extra initials or letters)
   - Mayor's key priorities, especially related to emergency services
   - City council members (especially those on public safety committees)
   - City manager or chief administrative officer

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
- Provide SPECIFIC NAMES, NUMBERS, and FACTS whenever possible
- For names: Use EXACT names as they appear in official sources. Do NOT add extra initials, letters, or characters (e.g., if you see "Erick Peterson", use exactly that - do not add "B. R. H." or other letters)
- Verify all names before including them - check spelling and do not add extra characters
- If information is not available, clearly state "Information not found" for that specific item
- Focus on information that would be publicly available and that a well-prepared candidate should know
- Format clearly with headings so specific facts can be easily extracted for knowledge-testing questions
- This research will be used to generate questions that TEST the candidate's knowledge, not behavioral questions
- Accuracy is ESSENTIAL - incorrect information will cause candidates to be marked wrong even when they give correct answers

Provide a structured summary (400-600 words) with clear sections for each category above.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a research assistant that provides ACCURATE, VERIFIABLE information about fire departments, police departments, and emergency services.

CRITICAL ACCURACY REQUIREMENTS:
1. For names: Use EXACT names as they appear in official sources. Do NOT add extra initials, letters, or characters.
   - If you see "Erick Peterson", use exactly "Erick Peterson" - NOT "Erick B. R. H. Peterson" or "Dan B. R. H. Hurst"
   - If you see "Dan Hurst", use exactly "Dan Hurst" - do not add extra letters
   - Only include middle initials if they are actually part of the official name

2. Verify all information before including it. If you are uncertain, state "Information not found" rather than guessing.

3. Cross-reference information when possible to ensure accuracy.

4. For numbers: Provide exact numbers when available, or clearly state "approximately X" if exact numbers are not available.

5. If information conflicts between sources, note the discrepancy and state which source you're using.

6. Accuracy is CRITICAL - incorrect information will cause interview candidates to be marked wrong even when they give correct answers.

Your research will be used to verify candidate answers in interviews, so every fact must be accurate and verifiable.`
        },
        {
          role: "user",
          content: researchPrompt
        }
      ],
      temperature: 0.3, // Lower temperature for more factual responses
      max_tokens: 1000
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
    // Use jsDelivr CDN which is more reliable than raw.githubusercontent.com
    // jsDelivr serves the npm package directly and handles large files better
    const baseUrl = 'https://cdn.jsdelivr.net/npm/countries-states-cities-database@latest/json';
    
    console.log('Loading location data from countries-states-cities-database...');
    
    const [countriesRes, statesRes, citiesRes] = await Promise.all([
      fetchModule(`${baseUrl}/countries.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }),
      fetchModule(`${baseUrl}/states.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      }),
      fetchModule(`${baseUrl}/cities.json`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fire-Interview-Coach-API/1.0'
        }
      })
    ]);
    
    // Check if responses are OK
    if (!countriesRes.ok || !statesRes.ok || !citiesRes.ok) {
      throw new Error(`HTTP error: countries=${countriesRes.status}, states=${statesRes.status}, cities=${citiesRes.status}`);
    }
    
    // Get text first to check if it's actually JSON
    const [countriesText, statesText, citiesText] = await Promise.all([
      countriesRes.text(),
      statesRes.text(),
      citiesRes.text()
    ]);
    
    // Check if we got HTML (error page) instead of JSON
    if (countriesText.trim().startsWith('<') || statesText.trim().startsWith('<') || citiesText.trim().startsWith('<')) {
      throw new Error('Received HTML instead of JSON (likely an error page)');
    }
    
    // Parse JSON
    countriesData = JSON.parse(countriesText);
    statesData = JSON.parse(statesText);
    citiesData = JSON.parse(citiesText);
    
    console.log(`✓ Loaded ${countriesData.length} countries, ${statesData.length} states, ${citiesData.length} cities`);
  } catch (error) {
    console.error('Failed to load location data, falling back to static lists:', error.message || error);
    // Fall back to static lists if API fails - this is non-critical
    countriesData = null;
    statesData = null;
    citiesData = null;
  }
}

// Load data on server start
loadLocationData();

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
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
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
