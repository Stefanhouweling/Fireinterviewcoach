// Question Bank - Pre-determined questions organized by type, category, and difficulty
// This provides a large pool of high-quality questions that can be selected from

const fs = require('fs');
const path = require('path');

// Load master questions from JSON file
let masterQuestions = [];
try {
  const masterQuestionsPath = path.join(__dirname, 'masterQuestions.json');
  const masterQuestionsData = fs.readFileSync(masterQuestionsPath, 'utf8');
  masterQuestions = JSON.parse(masterQuestionsData);
  console.log(`[QUESTION BANK] Loaded ${masterQuestions.length} questions from masterQuestions.json`);
} catch (error) {
  console.error('[QUESTION BANK] Error loading master questions:', error.message);
  masterQuestions = [];
}

// Normalize category names to match system categories
function normalizeCategory(category) {
  const categoryMap = {
    'Situational': 'Situational',
    'Behavioral': 'Behavioral',
    'Resume-Based': 'Resume-Based',
    'City & Community Specific': 'City & Department Specific',
    'Department Specific': 'City & Department Specific',
    'Leadership': 'Leadership',
    'Chain of Command': 'Chain of Command',
    'Safety & Accountability': 'Safety & Accountability',
    'Teamwork & Collaboration': 'Teamwork & Collaboration',
    'Conflict Resolution': 'Conflict Resolution',
    'Communication': 'Communication',
    'Stress Management': 'Stress Management',
    'Ethics & Integrity': 'Ethics & Integrity',
    'Technical – Fireground': 'Technical – Fireground',
    'Medical / EMR': 'Medical / EMR'
  };
  return categoryMap[category] || category;
}

// Determine question type (behavioral vs situational) from question text
function determineQuestionType(question, category) {
  const questionLower = question.toLowerCase();
  
  // Behavioral indicators
  if (questionLower.includes('tell us about a time') ||
      questionLower.includes('describe a time') ||
      questionLower.includes('give an example of') ||
      questionLower.includes('share an experience') ||
      questionLower.includes('recall a time') ||
      questionLower.includes('tell me about') ||
      category === 'Behavioral') {
    return 'behavioral';
  }
  
  // Situational indicators
  if (questionLower.includes('how would you') ||
      questionLower.includes('what would you') ||
      questionLower.includes('walk us through') ||
      questionLower.includes('explain your approach') ||
      questionLower.includes('describe your') ||
      questionLower.includes('what is your plan') ||
      category === 'Situational') {
    return 'situational';
  }
  
  // Default to situational for fire service questions
  return 'situational';
}

// Convert master questions to internal format
function convertMasterQuestions() {
  const converted = {
    behavioral: { easy: [], medium: [], hard: [] },
    situational: { easy: [], medium: [], hard: [] }
  };
  
  for (const q of masterQuestions) {
    const type = determineQuestionType(q.question, q.category);
    const difficulty = q.difficulty ? q.difficulty.toLowerCase() : 'medium';
    const category = normalizeCategory(q.category);
    
    if (['easy', 'medium', 'hard'].includes(difficulty)) {
      converted[type][difficulty].push({
        category: category,
        question: q.question,
        type: type,
        difficulty: difficulty,
        originalCategory: q.category
      });
    }
  }
  
  return converted;
}

const masterQuestionBank = convertMasterQuestions();

const questionBank = {
  behavioral: {
    easy: [
      {
        category: "Teamwork",
        question: "Tell us about a time when you had to work as part of a team to accomplish a goal. What was your role and how did you contribute?",
        tags: ["teamwork", "collaboration", "basic"]
      },
      {
        category: "Communication",
        question: "Describe a situation where you had to explain something complex to someone who didn't understand. How did you handle it?",
        tags: ["communication", "patience", "basic"]
      },
      {
        category: "Reliability",
        question: "Give an example of a time when you were responsible for completing an important task. How did you ensure it was done correctly?",
        tags: ["reliability", "responsibility", "basic"]
      },
      {
        category: "Adaptability",
        question: "Tell us about a time when you had to adapt to a sudden change in plans. How did you handle it?",
        tags: ["adaptability", "flexibility", "basic"]
      },
      {
        category: "Customer Service",
        question: "Describe a time when you helped someone solve a problem. What was the situation and outcome?",
        tags: ["customer service", "helping others", "basic"]
      }
    ],
    medium: [
      {
        category: "Behavioural – Conflict",
        question: "Tell us about a time when you disagreed with a supervisor or authority figure. How did you handle the situation while maintaining respect?",
        tags: ["conflict", "respect", "authority", "chain of command"]
      },
      {
        category: "Behavioural – High Stress",
        question: "Describe a situation where you were under significant pressure and had to make a quick decision. What was the outcome?",
        tags: ["stress", "decision-making", "pressure", "critical thinking"]
      },
      {
        category: "Safety & Accountability",
        question: "Tell us about a time when you noticed a safety concern or hazard. What did you do about it?",
        tags: ["safety", "accountability", "observation", "proactive"]
      },
      {
        category: "Teamwork",
        question: "Give an example of a time when you had to work with someone who had a different work style than you. How did you manage the differences?",
        tags: ["teamwork", "diversity", "collaboration", "interpersonal"]
      },
      {
        category: "Resilience",
        question: "Describe a time when you failed at something or made a mistake. How did you recover and what did you learn?",
        tags: ["resilience", "failure", "learning", "growth"]
      },
      {
        category: "Leadership",
        question: "Tell us about a time when you had to take charge of a situation even though you weren't the designated leader. What happened?",
        tags: ["leadership", "initiative", "responsibility", "situational leadership"]
      },
      {
        category: "Medical / EMR",
        question: "Describe a time when you had to provide care or assistance to someone who was injured or in distress. What was your approach?",
        tags: ["medical", "care", "compassion", "emergency response"]
      },
      {
        category: "Community Focus",
        question: "Tell us about a time when you went above and beyond to help someone in your community. What motivated you?",
        tags: ["community", "service", "dedication", "values"]
      }
    ],
    hard: [
      {
        category: "Behavioural – High Stress",
        question: "Describe a situation where you had to make a critical decision with limited information and significant consequences. Walk us through your thought process.",
        tags: ["stress", "decision-making", "uncertainty", "critical thinking", "judgment"]
      },
      {
        category: "Behavioural – Conflict",
        question: "Tell us about a time when you witnessed unethical behavior or a violation of rules by a colleague or superior. How did you handle it?",
        tags: ["ethics", "integrity", "whistleblowing", "moral courage", "accountability"]
      },
      {
        category: "Safety & Accountability",
        question: "Describe a situation where you had to stop someone from doing something unsafe, even though it created tension. How did you approach it?",
        tags: ["safety", "intervention", "conflict", "courage", "leadership"]
      },
      {
        category: "Resilience",
        question: "Tell us about the most difficult challenge you've faced in your life or career. How did it change you and what did you learn?",
        tags: ["resilience", "adversity", "growth", "character", "perseverance"]
      },
      {
        category: "Teamwork",
        question: "Describe a time when you had to work with a team member who was not pulling their weight or was causing problems. How did you address it?",
        tags: ["teamwork", "conflict resolution", "accountability", "leadership", "difficult conversations"]
      },
      {
        category: "Medical / EMR",
        question: "Tell us about a time when you had to provide medical care in a high-stress, chaotic environment. How did you maintain focus and ensure proper care?",
        tags: ["medical", "stress", "focus", "chaos", "professionalism"]
      },
      {
        category: "Leadership",
        question: "Describe a situation where you had to lead a team through a crisis or emergency. What was your approach and what challenges did you face?",
        tags: ["leadership", "crisis management", "emergency", "decision-making", "team coordination"]
      },
      {
        category: "Technical – Fireground",
        question: "Tell us about a time when you had to apply technical knowledge or skills in a high-pressure situation. How did your training help you?",
        tags: ["technical", "training", "application", "pressure", "competence"]
      }
    ]
  },
  situational: {
    easy: [
      {
        category: "Teamwork",
        question: "You're working on a group project and notice that one team member is struggling to complete their part. How would you help them while ensuring the project stays on track?",
        tags: ["teamwork", "helping", "support", "basic"]
      },
      {
        category: "Communication",
        question: "You need to explain a complex procedure to someone who is new and doesn't have much experience. How would you approach this?",
        tags: ["communication", "teaching", "patience", "basic"]
      },
      {
        category: "Reliability",
        question: "You're assigned an important task with a tight deadline, but you realize you might not have all the resources you need. What would you do?",
        tags: ["reliability", "problem-solving", "resourcefulness", "basic"]
      },
      {
        category: "Adaptability",
        question: "Your plans for the day suddenly change due to an unexpected situation. How would you adapt and reorganize your priorities?",
        tags: ["adaptability", "flexibility", "prioritization", "basic"]
      },
      {
        category: "Customer Service",
        question: "Someone approaches you asking for help with something that's not really your responsibility. How would you handle this?",
        tags: ["customer service", "helping", "boundaries", "basic"]
      }
    ],
    medium: [
      {
        category: "Behavioural – Conflict",
        question: "You're in a situation where a supervisor gives you an instruction that you believe might be unsafe or incorrect. How would you handle this?",
        tags: ["conflict", "safety", "authority", "chain of command", "respect"]
      },
      {
        category: "Behavioural – High Stress",
        question: "You're in a high-pressure situation where you need to make a quick decision, but you don't have all the information you'd like. How would you proceed?",
        tags: ["stress", "decision-making", "uncertainty", "judgment"]
      },
      {
        category: "Safety & Accountability",
        question: "You notice a coworker repeatedly taking shortcuts that could compromise safety. How would you address this situation?",
        tags: ["safety", "accountability", "intervention", "colleague relations"]
      },
      {
        category: "Teamwork",
        question: "You're working with a team member who has a very different communication style than you. How would you ensure effective collaboration?",
        tags: ["teamwork", "communication", "diversity", "adaptation"]
      },
      {
        category: "Resilience",
        question: "You make a mistake that affects others on your team. How would you take responsibility and help fix the situation?",
        tags: ["resilience", "accountability", "mistakes", "recovery"]
      },
      {
        category: "Medical / EMR",
        question: "You arrive at a scene where someone is injured and needs immediate care, but you're waiting for more advanced medical personnel. What would you do?",
        tags: ["medical", "triage", "first aid", "scene management"]
      },
      {
        category: "Community Focus",
        question: "A member of the public approaches you with a complaint about emergency services in your area. How would you handle this interaction?",
        tags: ["community", "public relations", "communication", "service"]
      },
      {
        category: "Technical – Fireground",
        question: "You're at a fire scene and notice something that doesn't look right based on your training, but others don't seem concerned. How would you handle this?",
        tags: ["technical", "observation", "safety", "speaking up"]
      }
    ],
    hard: [
      {
        category: "Behavioural – High Stress",
        question: "You're in a life-threatening emergency situation where you must make a split-second decision that could affect multiple people. Walk us through how you would approach this decision.",
        tags: ["stress", "life-threatening", "decision-making", "critical thinking", "pressure"]
      },
      {
        category: "Behavioural – Conflict",
        question: "You discover that a respected senior colleague has been violating safety protocols and covering it up. How would you handle this situation?",
        tags: ["ethics", "integrity", "whistleblowing", "moral courage", "seniority"]
      },
      {
        category: "Safety & Accountability",
        question: "You're in a situation where following proper safety procedures would mean delaying a response that could save lives. How would you balance safety with urgency?",
        tags: ["safety", "ethics", "decision-making", "risk assessment", "dilemma"]
      },
      {
        category: "Resilience",
        question: "You're dealing with a traumatic incident that affected you personally, but you need to continue performing your duties. How would you manage this?",
        tags: ["resilience", "trauma", "mental health", "professionalism", "self-care"]
      },
      {
        category: "Teamwork",
        question: "You're leading a team during an emergency, and one team member is panicking and not following instructions, potentially putting others at risk. How would you handle this?",
        tags: ["leadership", "crisis", "team management", "panic", "safety"]
      },
      {
        category: "Medical / EMR",
        question: "You're providing medical care at a scene with multiple casualties, limited resources, and you must decide who to treat first. How would you make these triage decisions?",
        tags: ["medical", "triage", "resource allocation", "ethics", "decision-making"]
      },
      {
        category: "Leadership",
        question: "You're in charge during a major incident, and you receive conflicting information from multiple sources while needing to make critical decisions. How would you manage this?",
        tags: ["leadership", "crisis management", "information overload", "decision-making", "command"]
      },
      {
        category: "Technical – Fireground",
        question: "You're at a fire scene and your training tells you one thing, but the incident commander is giving you an order that seems to contradict your training. How would you handle this?",
        tags: ["technical", "authority", "training", "conflict", "chain of command"]
      }
    ]
  }
};

// Helper function to get questions by filters
function getQuestions(type = null, difficulty = null, category = null, excludeQuestions = []) {
  let questions = [];
  
  // If no type specified, get both behavioral and situational
  const types = type ? [type] : ['behavioral', 'situational'];
  
  // Search in master question bank first (larger pool)
  for (const questionType of types) {
    if (!masterQuestionBank[questionType]) continue;
    
    // If no difficulty specified, get all difficulties
    const difficulties = difficulty ? [difficulty] : ['easy', 'medium', 'hard'];
    
    for (const diff of difficulties) {
      if (!masterQuestionBank[questionType][diff]) continue;
      
      for (const q of masterQuestionBank[questionType][diff]) {
        // Filter by category if specified
        if (category && q.category.toLowerCase() !== category.toLowerCase()) {
          continue;
        }
        
        // Exclude questions that have already been asked
        const questionLower = q.question.toLowerCase().trim();
        const isExcluded = excludeQuestions.some(excluded => 
          excluded.toLowerCase().trim() === questionLower
        );
        
        if (!isExcluded) {
          questions.push({
            ...q,
            type: questionType,
            difficulty: diff
          });
        }
      }
    }
  }
  
  // Fallback to original question bank if master bank doesn't have enough
  if (questions.length === 0) {
    for (const questionType of types) {
      if (!questionBank[questionType]) continue;
      
      const difficulties = difficulty ? [difficulty] : ['easy', 'medium', 'hard'];
      
      for (const diff of difficulties) {
        if (!questionBank[questionType][diff]) continue;
        
        for (const q of questionBank[questionType][diff]) {
          if (category && q.category.toLowerCase() !== category.toLowerCase()) {
            continue;
          }
          
          const questionLower = q.question.toLowerCase().trim();
          const isExcluded = excludeQuestions.some(excluded => 
            excluded.toLowerCase().trim() === questionLower
          );
          
          if (!isExcluded) {
            questions.push({
              ...q,
              type: questionType,
              difficulty: diff
            });
          }
        }
      }
    }
  }
  
  return questions;
}

// Get a random question matching filters
function getRandomQuestion(type = null, difficulty = null, category = null, excludeQuestions = []) {
  const questions = getQuestions(type, difficulty, category, excludeQuestions);
  
  if (questions.length === 0) {
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * questions.length);
  return questions[randomIndex];
}

// Get question count statistics
function getQuestionStats() {
  const stats = {
    behavioral: { easy: 0, medium: 0, hard: 0, total: 0 },
    situational: { easy: 0, medium: 0, hard: 0, total: 0 },
    total: 0
  };
  
  // Count from master question bank
  for (const type of ['behavioral', 'situational']) {
    for (const diff of ['easy', 'medium', 'hard']) {
      const masterCount = masterQuestionBank[type]?.[diff]?.length || 0;
      const originalCount = questionBank[type]?.[diff]?.length || 0;
      const count = masterCount + originalCount;
      stats[type][diff] = count;
      stats[type].total += count;
    }
    stats.total += stats[type].total;
  }
  
  return stats;
}

module.exports = {
  questionBank,
  getQuestions,
  getRandomQuestion,
  getQuestionStats
};


