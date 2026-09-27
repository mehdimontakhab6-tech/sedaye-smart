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
          "Accept": "application/json",
        },
        body: JSON.stringify({
          question: text,
        }),
      });

      const rawText = await response.text();

      let data: any = null;

      try {
        data = JSON.parse(rawText);
      } catch {
        data = {
          raw: rawText,
        };
      }

      if (!response.ok) {
        setAnswer(
          `خطای سامانه

کد خطا: ${response.status}

${
  data?.error ||
  data?.details ||
  data?.message ||
  data?.raw ||
  "پاسخ نامعتبر از سرور دریافت شد."
}`
        );

        return;
      }

      if (data?.ok && data?.answer) {
        setAnswer(data.answer);
        return;
      }

      if (data?.answer) {
        setAnswer(data.answer);
        return;
      }

      setAnswer(
        `سامانه پاسخ متنی برنگرداند.

پاسخ سرور:

${rawText}`
      );

    } catch (error: any) {
      console.error(error);

      setAnswer(
        `خطا در ارتباط با سامانه

${
  error?.message ||
  "ارتباط با API برقرار نشد."
}`
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
            🤖 مدیر پاسخگو هوشمند
          </h2>

          <p
            style={{
              color: "#666",
              lineHeight: 1.8,
            }}
          >
            پرسش خود را وارد کنید تا مدیر پاسخگو هوشمند
            آن را بررسی و پاسخ دهد.
          </p>

          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="پرسش خود را اینجا بنویسید..."
            rows={5}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #ddd",
              borderRadius: "14px",
              padding: "14px",
              fontSize: "16px",
              resize: "vertical",
              outline: "none",
            }}
          />

          <button
            onClick={askAI}
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
            }}
          >
            {loading
              ? "در حال بررسی..."
              : "ارسال پرسش"}
          </button>

          <div
            style={{
              marginTop: "24px",
              background: "#f8f9fc",
              borderRadius: "16px",
              padding: "18px",
              minHeight: "80px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.9,
            }}
          >
            <strong>
              🤖 پاسخ مدیر پاسخگو هوشمند
            </strong>

            <div style={{ marginTop: "12px" }}>
              {answer ||
                "هنوز پرسشی ارسال نشده است."}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
