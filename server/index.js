require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const fetch = require('node-fetch');

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
      tts: 'POST /api/tts'
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
    const { resumeText, resumeAnalysis, history, askedQuestions = [], askedCategories = [], practiceMode = "simulation", selectedCategory = "" } = req.body;

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
    
    const diversityContext = askedQuestions.length > 0
      ? `\n\nCRITICAL - Questions already asked in this session (DO NOT repeat these):\n${askedQuestions.slice(-10).map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nCategories already covered: ${askedCategories.join(", ") || "None"}\n\nYou MUST generate a completely different question that hasn't been asked yet.`
      : "";

    // Determine question strategy based on mode
    let questionStrategy = "";
    if (practiceMode === "specific" && selectedCategory) {
      if (selectedCategory === "Resume-Based") {
        questionStrategy = `Generate a question SPECIFICALLY based on the candidate's resume. Reference their actual experience, certifications, or background mentioned in the resume. However, keep it general enough that it tests their judgment and understanding, not just their specific past. Mix resume-specific elements with general firefighter competencies.`;
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
          content: `Generate a single firefighter interview question.

${questionStrategy}

${resumeContext}${conversationContext}${diversityContext}

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
          content: `You are an expert firefighter interview coach. Your goal is to help candidates develop better answers.

Interview Question: ${question}
Question Category: General

Candidate's Answer:
"${answer}"

Body Language Score (higher = more movement/fidgeting): ${motionScore ?? "unknown"}
${resumeContext}

CRITICAL: First, determine if this is a BEHAVIORAL question (past experience) or HYPOTHETICAL question (future scenario).

- BEHAVIORAL questions: "Tell me about a time when...", "Describe a situation where...", "Give me an example of..."
  → Use STAR method (Situation-Task-Action-Result) for these
  
- HYPOTHETICAL questions: "How would you...", "What would you do if...", "How would you approach..."
  → DO NOT use STAR method for these. Focus on: approach, reasoning, chain of command, ethics, decision-making process, specific steps they would take.

Analyze the question above and provide appropriate feedback. Structure your response as follows:

## Answer Summary
[2-3 sentence summary of what they said - be specific about what they covered]

## Question Type Analysis
[First, identify if this is behavioral (past experience) or hypothetical (future scenario), then provide appropriate analysis]

IF BEHAVIORAL (past experience) - Use this section:
## STAR Method Analysis
Break down their answer:
- **Situation**: Did they set the scene? [What they did/didn't do]
- **Task**: Did they explain what needed to be done? [What they did/didn't do]
- **Action**: Did they describe their specific actions? [What they did/didn't do]
- **Result**: Did they explain the outcome? [What they did/didn't do]

## How to Improve Using STAR
Provide a concrete example showing how they could restructure their answer using STAR.

IF HYPOTHETICAL (future scenario) - Use this section instead:
## Approach Analysis
Evaluate their answer on:
- **Clarity of Approach**: Did they clearly explain their step-by-step approach?
- **Reasoning**: Did they explain WHY they would take those actions?
- **Chain of Command**: Did they consider proper hierarchy and who to involve?
- **Ethics & Safety**: Did they prioritize safety and ethical considerations?
- **Specificity**: Were their actions specific enough, or too vague? What would they actually say or do?

## How to Improve (For Hypothetical Questions)
Provide guidance on:
- Being more specific about what they would actually say or do
- Explaining their reasoning and thought process
- Considering all stakeholders (team, chain of command, safety)
- Showing they understand fire service protocols
- DO NOT suggest using STAR method for hypothetical questions - it doesn't apply

## Strengths
- [Specific point 1 - what they did well]
- [Specific point 2]
- [Specific point 3]

## Areas for Improvement
- [Specific point 1 - what needs work]
- [Specific point 2]
- [Specific point 3]

## Panel-Ready Score: [X]/10
[Brief explanation of the score and what would make it a 10/10]

## Practice Exercise
[If behavioral: "Try answering this question again, but this time start with 'The situation was...' and make sure to include the result at the end."]
[If hypothetical: "Try answering this question again, but this time be more specific about each step you would take and explain your reasoning for each decision. Remember, this is a hypothetical question, so focus on your approach and reasoning, not a past experience."]

## Reformulated Answer (Panel-Ready Version)
[IMPORTANT: Create a polished, panel-ready version of their answer. Take what they said and reformulate it into a strong, professional answer that:
- Incorporates all the key points they mentioned
- Uses their actual experience, certifications, and background from their resume (if provided)
- Follows STAR method if behavioral, or clear step-by-step approach if hypothetical
- Is specific, clear, and demonstrates firefighter competencies
- Shows proper chain of command awareness, safety focus, and professional judgment
- Is the answer they SHOULD give - polished and ready for a real panel

Format this as a complete, natural-sounding answer that they could use as a template. Make it sound like them but better - use their words and ideas, just refined and structured properly.]

Use clear markdown formatting with ## for main sections and - for bullet points. Be encouraging but specific.`
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

    const content = response.choices[0].message.content;
    const resumeAnalysis = typeof content === "string" ? JSON.parse(content) : content;

    res.json({ analysis: resumeAnalysis });
  } catch (error) {
    console.error('Error parsing resume:', error);
    res.status(500).json({ error: 'Failed to parse resume', message: error.message });
  }
});

// POST /api/tts - Text-to-speech using OpenAI TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice = "alloy" } = req.body; // voice options: alloy, echo, fable, onyx, nova, shimmer

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    console.log(`Generating TTS for text: "${text.substring(0, 50)}..." with voice: ${voice}`);

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

// Start server
app.listen(PORT, () => {
  console.log(`🔥 Fire Interview Coach API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
