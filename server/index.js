require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
// Use node-fetch for external API calls (Nominatim)
const fetchModule = require('node-fetch');

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

// POST /api/question - Generate a new interview question
app.post('/api/question', async (req, res) => {
  try {
    const { resumeText, resumeAnalysis, history, askedQuestions = [], askedCategories = [], practiceMode = "simulation", selectedCategory = "", onboardingData = null } = req.body;

    // Build comprehensive resume context
    let resumeContext = "";
    if (resumeAnalysis) {
      const analysis = resumeAnalysis;
      resumeContext = `Resume Summary:
- Experience: ${analysis.experience || analysis.yearsOfExperience || "N/A"}
- Certifications: ${Array.isArray(analysis.certifications) ? analysis.certifications.join(", ") : "None listed"}
- Key Skills: ${Array.isArray(analysis.skills) ? analysis.skills.slice(0, 5).join(", ") : "General"}
- Work History Highlights: ${Array.isArray(analysis.workHistory) ? analysis.workHistory.slice(0, 3).join("; ") : "N/A"}
- Interview Focus Areas: ${Array.isArray(analysis.interviewFocus) ? analysis.interviewFocus.join(", ") : "General competencies"}

Full Resume Analysis: ${JSON.stringify(resumeAnalysis)}`;
    } else if (resumeText) {
      resumeContext = `Resume Text (full text for context):
${resumeText}`;
    } else {
      resumeContext = "No resume provided";
    }
    
    const conversationContext = history && history.length > 0
      ? `\n\nPrevious questions asked:\n${history.slice(-3).map((item, i) => 
          `${i + 1}. Q: ${item.question}\n   A: ${item.answer ? item.answer.slice(0, 200) + "..." : "No answer yet"}`
        ).join("\n")}`
      : "";
    
    // Normalize asked categories (usually sent as lowercase from frontend)
    const normalizedAskedCategories = askedCategories.map(c => String(c).toLowerCase());

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

    const diversityContext = askedQuestions.length > 0
      ? `\n\nCRITICAL - Questions already asked in this session (DO NOT repeat these):\n${askedQuestions.slice(-10).map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nCategories already covered: ${askedCategories.join(", ") || "None"}\n\nYou MUST generate a completely different question that hasn't been asked yet.${categoryRotationHint}`
      : `\n\nNo questions have been asked yet in this session. Start with any one of the base categories: ${baseCategories.join(", ")}. Make the category explicit.`;

    // Build onboarding context (city, department, job type)
    let onboardingContext = "";
    if (onboardingData) {
      const { city, stateProvince, country, jobType, departmentName, cityResearch } = onboardingData;
      const locationString = stateProvince 
        ? `${city}, ${stateProvince}, ${country}`
        : `${city}, ${country}`;
      
      onboardingContext = `\n\nDEPARTMENT & LOCATION CONTEXT (USE THIS TO PERSONALIZE QUESTIONS):
- Position Type: ${jobType}
- Department: ${departmentName}
- Location: ${locationString}`;
      
      if (cityResearch) {
        onboardingContext += `\n\nCity/Department Research:\n${cityResearch}\n\nIMPORTANT: Incorporate specific, accurate information from this research into your questions when relevant. For example:
- Reference the department name: "Working for the ${departmentName} is a stressful job, tell us about a time..."
- Reference city-specific challenges or initiatives from the research
- Reference the fire chief's name or department history when appropriate
- Make questions feel personalized to this specific department and city while still testing general competencies`;
      } else {
        onboardingContext += `\n\nIMPORTANT: When generating questions, incorporate the department name "${departmentName}" and location context naturally. For example: "Working for the ${departmentName} is a stressful job, tell us about a time..." or "Given the challenges in ${city}, how would you handle...". Make questions feel personalized to this specific department while still testing general competencies.`;
      }
    }

    // Get candidate name from onboarding data
    const candidateName = onboardingData?.name || null;
    const nameContext = candidateName ? `\n\nIMPORTANT: The candidate's name is ${candidateName}. Occasionally address them by name in questions to make it more personal and realistic (e.g., "${candidateName}, tell us about a time..." or "${candidateName}, how would you..."). Use the name naturally, not in every question - mix it in about 30% of the time.` : "";

    // Determine question strategy based on mode
    let questionStrategy = "";
    if (practiceMode === "specific" && selectedCategory) {
      if (selectedCategory === "Resume-Based") {
        questionStrategy = `Generate a question SPECIFICALLY based on the candidate's resume. Reference their actual experience, certifications, or background mentioned in the resume. However, keep it general enough that it tests their judgment and understanding, not just their specific past. Mix resume-specific elements with general firefighter competencies.`;
      } else if (selectedCategory === "City & Department Specific") {
        questionStrategy = `Generate a question SPECIFICALLY about the city and department the candidate is applying to. Use the city research and department information to create questions that reference:
- The specific department name and its history
- City-specific challenges, demographics, or initiatives
- The fire chief's name or department leadership
- Local union information or department structure
- City planning or emergency services initiatives
Make the question feel personalized to THIS specific department and city while still testing general firefighter competencies. Examples: "Working for the ${onboardingData?.departmentName || '[Department Name]'} is a stressful job, ${candidateName ? candidateName + ', ' : ''}tell us about a time..." or "Given the challenges in ${onboardingData?.city || '[City]'}, how would you handle...".`;
      } else {
        questionStrategy = `Generate a question focused on the category: "${selectedCategory}". Make it relevant to this specific area while still being a general situational question.`;
      }
    } else if (practiceMode === "simulation") {
      questionStrategy = `Generate a RANDOM question from any category. Vary the topics to simulate a real interview where questions come from different areas. Mix general questions with occasional resume-based questions (about 20% resume-based, 80% general) if a resume is provided.`;
    } else {
      questionStrategy = `Generate a question mixing general firefighter competencies with occasional resume references (about 20% resume-based, 80% general) if a resume is provided.`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert firefighter interview panel member. Generate realistic, challenging interview questions that test behavioral competencies, technical knowledge, and situational judgment. Focus on GENERAL, OPEN-ENDED situational questions that any firefighter candidate might face, similar to: 'How would you handle a situation if you felt you weren't treated fairly?' or 'How would you handle a leader where you question their leadership, would you still respect them?' Keep questions broad and applicable to all candidates, not overly specific to their resume. The questions should test judgment, ethics, chain of command, and decision-making in hypothetical scenarios. CRITICAL: Ensure questions are UNIQUE and cover diverse topics/areas. Vary the categories and themes to provide comprehensive coverage of different firefighter competencies. If a resume is provided, occasionally reference different aspects of their background (certifications, experience, skills) but keep questions general enough for all candidates."
        },
        {
          role: "user",
          content: `Generate a single ${onboardingData?.jobType || 'firefighter'} interview question.

${questionStrategy}

${resumeContext}${diversityContext}${onboardingContext}${nameContext}

IMPORTANT: This is a NEW, UNRELATED question. Do NOT make it a follow-up to previous questions. Generate a completely fresh question from a different topic/angle.

Requirements:
- Question should be a GENERAL situational/hypothetical question (like "How would you handle a situation if...")
- Keep it broad and applicable to all candidates, not overly specific to their resume
- Examples of good questions:
  * "How would you handle a situation if you felt you weren't treated fairly?"
  * "How would you handle a leader where you question their leadership, would you still respect them?"
  * "Your Captain orders you to get a radio from the engine. On the way a senior fire officer stops you and asks you to deliver an axe to the team on the roof right away. How would you handle this?"
  * Resume-based example: "Given your experience with [specific certification/experience from resume], how would you approach a situation where you need to apply that knowledge under pressure?"
- Test: chain of command, ethics, judgment, decision-making, conflict resolution
- CRITICAL: The question MUST be completely different from any question already asked (see list above)
- Ensure diversity: Cover different topics and areas. If many questions have been asked, explore new categories/topics. Vary between: chain of command, ethics, conflict resolution, safety, teamwork, leadership, decision-making, communication, stress management, equipment, training, etc.
- If resume is provided and mode allows, occasionally reference different aspects of their background (certifications, experience, skills) but keep questions general enough for all candidates
- Rotate through different question types: hypothetical scenarios, ethical dilemmas, chain of command situations, team dynamics, safety protocols, etc.
- Format: "Category: [category]\nQuestion: [question text]"

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
    const { question, answer, motionScore, resumeAnalysis, resumeText, conversationHistory = [] } = req.body;

    const resumeContext = resumeAnalysis 
      ? `Resume Analysis: ${JSON.stringify(resumeAnalysis)}`
      : resumeText 
        ? `Resume (full): ${resumeText}`
        : "No resume provided";

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
            "Question Category: General\n\n" +
            "Candidate's Answer:\n" +
            "\"" + String(answer).replace(/"/g, '\\"') + "\"\n\n" +
            "Body Language Score (higher = more movement/fidgeting): " + (motionScore ?? "unknown") + "\n" +
            resumeContext + "\n\n" +
            "CRITICAL: First, determine if this is a BEHAVIORAL question (past experience) or HYPOTHETICAL question (future scenario).\n\n" +
            "- BEHAVIORAL questions: \"Tell me about a time when...\", \"Describe a situation where...\", \"Give me an example of...\"\n" +
            "  → Use STAR method (Situation-Task-Action-Result) for these.\n\n" +
            "- HYPOTHETICAL questions: \"How would you...\", \"What would you do if...\", \"How would you approach...\"\n" +
            "  → DO NOT use STAR method for these. Focus on: approach, reasoning, chain of command, ethics, decision-making process, specific steps they would take.\n\n" +
            "Keep the response concise and easy to skim. Avoid long paragraphs. Use short sentences and compact sections.\n\n" +
            "STRUCTURE YOUR RESPONSE EXACTLY LIKE THIS (use markdown headings and bold labels with double asterisks, NOT star symbols):\n\n" +
            "## Answer Summary & Score\n" +
            "- **Summary:** [1–2 short sentences summarizing what they actually said, using plain language]\n" +
            "- **Score:** [X/10 – very short explanation of why, and what would make it a 10/10]\n\n" +
            "## What You Did Well\n" +
            "- **Positive 1:** [Short, specific positive point]\n" +
            "- **Positive 2:** [Short, specific positive point]\n" +
            "- **Positive 3 (optional):** [Only if there is a clear extra strength]\n\n" +
            "## What To Improve Next\n" +
            "- **Focus 1:** [Very practical change they can make next time]\n" +
            "- **Focus 2:** [Another clear tweak or addition]\n" +
            "- **Focus 3 (optional):** [Only if it adds real value]\n\n" +
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
            "- Keep language natural, plain, and realistic for a firefighter candidate.\n\n" +
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

    const researchPrompt = `You are a research assistant helping to prepare personalized interview questions for a ${jobType} position at ${departmentName} in ${locationString}.

Research and provide accurate, specific information about this department and city that would be relevant for interview questions. Focus on:

1. Department History & Background:
   - When was the ${departmentName} first established as a career department?
   - What is the local union number for this department?
   - Who is the current fire chief (or equivalent leader) of ${departmentName}?
   - Any notable history or milestones

2. City/Department Planning:
   - What is the city's 5-year plan (or strategic plan) related to emergency services?
   - Any recent major initiatives, expansions, or changes in the department?
   - Community demographics or unique challenges

3. Department-Specific Information:
   - Station locations or number of stations
   - Department size (number of personnel)
   - Special programs or services offered
   - Any unique protocols or standards

4. Local Context:
   - Geographic or environmental factors that affect operations
   - Community relationships or partnerships
   - Any recent significant incidents or events

IMPORTANT: 
- Be accurate and specific. If you cannot find certain information, state "Information not readily available" rather than guessing.
- Focus on information that would be relevant for interview questions (e.g., "Working for the ${departmentName} is a stressful job, tell us about a time...")
- Format your response as a structured summary that can be easily incorporated into interview questions.

Provide a comprehensive but concise summary (300-500 words) that covers the most relevant and verifiable information.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a research assistant that provides accurate, specific information about fire departments, police departments, and emergency services. You help gather factual information that can be used to personalize interview questions."
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

// Load comprehensive country/state/city data from countries-states-cities-database
// Using the public JSON files from: https://github.com/dr5hn/countries-states-cities-database
let countriesData = null;
let statesData = null;
let citiesData = null;

// Load data on startup (lightweight, fast)
async function loadLocationData() {
  try {
    // Fetch from the public JSON files (CDN or GitHub raw)
    const baseUrl = 'https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master';
    
    console.log('Loading location data from countries-states-cities-database...');
    
    const [countriesRes, statesRes, citiesRes] = await Promise.all([
      fetchModule(`${baseUrl}/json/countries.json`),
      fetchModule(`${baseUrl}/json/states.json`),
      fetchModule(`${baseUrl}/json/cities.json`)
    ]);
    
    countriesData = await countriesRes.json();
    statesData = await statesRes.json();
    citiesData = await citiesRes.json();
    
    console.log(`✓ Loaded ${countriesData.length} countries, ${statesData.length} states, ${citiesData.length} cities`);
  } catch (error) {
    console.error('Failed to load location data, falling back to static lists:', error);
    // Fall back to static lists if API fails
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
