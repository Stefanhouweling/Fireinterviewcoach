  async function triggerAnalysis() {
    const text = (transcriptBox.textContent || "").trim();
    if (!text) {
      alert("No transcript found. Answer the question or type your answer first.");
      return;
    }
    lastAnswerTranscript = text;

    // Add to conversation history
    if (currentQuestion) {
      conversationHistory.push({
        question: currentQuestion.template,
        category: currentQuestion.category,
        answer: text,
        timestamp: Date.now()
      });
    }

    // ----- Local (instant) scoring -----
    const content = analyzeContent(text);
    const voice = analyzeVoice(text);
    const body = analyzeBody(motionScoreForAnswer);
    const tips = buildFireTips(content, voice, body);

    applyScoreToPill(contentScoreEl, content.score);
    applyScoreToPill(voiceScoreEl, voice.score);
    applyScoreToPill(bodyScoreEl, body.score);

    contentFeedbackEl.textContent = content.feedback;
    voiceFeedbackEl.textContent = voice.feedback;
    bodyFeedbackEl.textContent = body.feedback;
    fireTipsEl.textContent = tips;

    // ====== POPUP + AI LOADING BAR ======
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = "🤖 Analyzing with AI...";
    }

    // Open the AI modal immediately
    openAIModal();

    // Build loading UI inside the modal
    const modalContentEl = document.getElementById("aiModalContent");
    if (modalContentEl) {
      modalContentEl.innerHTML = `
        <div style="margin-bottom: 12px; font-size: 0.9rem; color: #e5e7eb;">
          Analyzing your answer and body language. This can take a few seconds...
        </div>
        <div style="margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size: 0.85rem; color:#cbd5e1;">Contacting AI Interview Coach</span>
          <span id="aiModalProgressPercent" style="font-size:0.85rem; color:#f97316; font-weight:600;">0%</span>
        </div>
        <div style="width:100%; height:8px; background:#111827; border-radius:999px; overflow:hidden;">
          <div id="aiModalProgressBar" style="width:0%; height:100%; background:linear-gradient(90deg,#f97316,#ef4444); transition:width 0.2s;"></div>
        </div>
      `;
    }

    const progressBar = document.getElementById("aiModalProgressBar");
    const progressPercent = document.getElementById("aiModalProgressPercent");
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      if (progressBar) progressBar.style.width = progress + "%";
      if (progressPercent) progressPercent.textContent = Math.round(progress) + "%";
    }, 200);

    try {
      const response = await fetch(`${BACKEND_URL}/api/analyze-answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question: currentQuestion ? currentQuestion.template : "Unknown",
          answer: text,
          motionScore: motionScoreForAnswer,
          resumeAnalysis: resumeAnalysis,
          resumeText: resumeText,
          conversationHistory: conversationHistory
        })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const data = await response.json();
      const aiFeedback = data.feedback;

      // Finish progress bar
      clearInterval(progressInterval);
      if (progressBar) progressBar.style.width = "100%";
      if (progressPercent) progressPercent.textContent = "100%";

      if (aiFeedback) {
        // Small preview in right-hand card
        formatAIFeedback(fireTipsEl, aiFeedback, true);
        // Full formatted feedback into the modal
        formatAIFeedbackForModal(aiFeedback);

        const viewBtn = document.getElementById("viewAIFeedbackBtn");
        if (viewBtn) {
          viewBtn.style.display = "block";
        }

        addFollowupButton();
      } else if (modalContentEl) {
        modalContentEl.innerHTML = `
          <p style="color:#fecaca;">AI didn't return any feedback. Please try again.</p>
        `;
      }
    } catch (err) {
      console.error("Backend analysis error:", err);
      clearInterval(progressInterval);
      if (modalContentEl) {
        modalContentEl.innerHTML = `
          <p style="color:#fecaca; margin-bottom:4px;">AI analysis failed.</p>
          <p style="color:#9ca3af; font-size:0.85rem;">Check your connection and try again.</p>
        `;
      }
    } finally {
      if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "🤖 Analyze Answer";
      }
    }
  }





