
"use client";

import { useState } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function askAI() {
    const text = question.trim();

    if (!text || loading) return;

    setLoading(true);
    setAnswer("");

    try {
      const response = await fetch("/api/ai/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/plain",
        },
        body: JSON.stringify({
          question: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        let errorMessage = errorText;

        try {
          const errorData = JSON.parse(errorText);
          errorMessage =
            errorData?.error ||
            errorData?.details ||
            errorData?.message ||
            errorText;
        } catch {
          // پاسخ خطا متن ساده است.
        }

        setAnswer(
          `خطای سامانه\n\nکد خطا: ${response.status}\n\n${errorMessage || "خطای نامشخص از سرور دریافت شد."}`
        );

        return;
      }

      if (!response.body) {
        throw new Error("جریان پاسخ از سرور در دسترس نیست.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let fullAnswer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        fullAnswer += decoder.decode(value, {
          stream: true,
        });

        setAnswer(fullAnswer);
      }

      fullAnswer += decoder.decode();

      if (fullAnswer) {
        setAnswer(fullAnswer);
      } else {
        setAnswer(
          "پاسخی از مدیر هوشمند دریافت نشد. لطفاً دوباره تلاش کنید."
        );
      }
    } catch (error: unknown) {
      console.error("AI request failed:", error);

      const message =
        error instanceof Error
          ? error.message
          : "ارتباط با API برقرار نشد.";

      setAnswer(
        `خطا در ارتباط با سامانه\n\n${message}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "24px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "28px",
            }}
          >
            صدای کارکنان ثبت احوال
          </h1>

          <p
            style={{
              marginTop: "10px",
              color: "#666",
            }}
          >
            هم‌صدایی برای تحول و بهبود
          </p>
        </header>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "24px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              fontSize: "22px",
            }}
          >
            🤖 مدیر هوشمند
          </h2>

          <p
            style={{
              color: "#666",
              lineHeight: 1.8,
            }}
          >
            پرسش خود را وارد کنید تا مدیر هوشمند
            آن را بررسی و پاسخ دهد.
          </p>

          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.ctrlKey || e.metaKey)
              ) {
                e.preventDefault();
                void askAI();
              }
            }}
            placeholder="پرسش خود را اینجا بنویسید..."
            rows={5}
            disabled={loading}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #ddd",
              borderRadius: "14px",
              padding: "14px",
              fontSize: "16px",
              resize: "vertical",
              outline: "none",
              lineHeight: 1.8,
            }}
          />

          <button
            onClick={() => void askAI()}
            disabled={loading || !question.trim()}
            style={{
              marginTop: "14px",
              width: "100%",
              border: "none",
              borderRadius: "14px",
              padding: "14px",
              fontSize: "17px",
              cursor:
                loading || !question.trim()
                  ? "not-allowed"
                  : "pointer",
              opacity:
                loading || !question.trim()
                  ? 0.6
                  : 1,
              background: "#2457c5",
              color: "#ffffff",
            }}
          >
            {loading
              ? "در حال دریافت پاسخ..."
              : "ارسال پرسش"}
          </button>

          <div
            aria-live="polite"
            style={{
              marginTop: "24px",
              background: "#f8f9fc",
              borderRadius: "16px",
              padding: "18px",
              minHeight: "80px",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              lineHeight: 1.9,
            }}
          >
            <strong>🤖 پاسخ مدیر هوشمند</strong>

            <div style={{ marginTop: "12px" }}>
              {answer ||
                (loading
                  ? "در حال آماده‌سازی پاسخ..."
                  : "هنوز پرسشی ارسال نشده است.")}
            </div>

            {loading && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#666",
                  fontSize: "13px",
                }}
              >
                مدیر هوشمند در حال پاسخ‌گویی است...
              </div>
            )}
          </div>

          <p
            style={{
              marginTop: "14px",
              color: "#777",
              fontSize: "13px",
              lineHeight: 1.8,
            }}
          >
            نکته: برای ارسال سریع‌تر می‌توانید از
            کلیدهای Ctrl + Enter نیز استفاده کنید.
          </p>
        </section>
      </div>
    </main>
  );
}
