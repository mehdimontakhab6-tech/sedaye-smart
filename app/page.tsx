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
        },
        body: JSON.stringify({
          question: text,
        }),
      });

      const data = await response.json();

      setAnswer(
        data?.answer ||
          "پاسخی از سامانه دریافت نشد."
      );
    } catch {
      setAnswer(
        "ارتباط با هوش مصنوعی برقرار نشد. لطفاً دوباره تلاش کنید."
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
        background:
          "linear-gradient(135deg,#f8fbff 0%,#eef6ff 50%,#f7f3ff 100%)",
        padding: "32px 16px",
        fontFamily:
          "Tahoma, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 28,
            padding: 32,
            boxShadow:
              "0 15px 45px rgba(30,60,100,.10)",
            border:
              "1px solid rgba(100,130,180,.12)",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: 999,
              background: "#eef4ff",
              color: "#315ea8",
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            🤖 مرکز نظارت
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(28px,5vw,48px)",
              lineHeight: 1.35,
              color: "#172033",
            }}
          >
            صدای هوشمند
          </h1>

          <h2
            style={{
              marginTop: 12,
              marginBottom: 12,
              fontSize: "clamp(20px,3vw,30px)",
              color: "#315ea8",
            }}
          >
            هم‌صدایی برای تحول و بهبود
          </h2>

          <p
            style={{
              color: "#5d687b",
              lineHeight: 2,
              fontSize: 16,
              maxWidth: 850,
            }}
          >
            سامانه هوشمند گروه «صدای کارکنان ثبت احوال»
            برای پاسخ‌گویی، بررسی مسائل، دریافت پیشنهادها،
            تحلیل درخواست‌ها و استفاده از دانش سازمانی.
          </p>

          <div
            style={{
              marginTop: 28,
              padding: 20,
              borderRadius: 22,
              background: "#f7faff",
              border: "1px solid #dce8fa",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                color: "#1f2d45",
                marginBottom: 12,
                fontSize: 18,
              }}
            >
              💬 گفت‌وگو با تیم هوش مصنوعی
            </div>

            <textarea
              value={question}
              onChange={(e) =>
                setQuestion(e.target.value)
              }
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  askAI();
                }
              }}
              placeholder="سؤال یا درخواست خود را بنویسید..."
              style={{
                width: "100%",
                minHeight: 120,
                resize: "vertical",
                borderRadius: 16,
                border: "1px solid #cdd9ea",
                padding: 16,
                fontSize: 16,
                lineHeight: 1.9,
                outline: "none",
                boxSizing: "border-box",
                fontFamily:
                  "Tahoma, Arial, sans-serif",
              }}
            />

            <button
              onClick={askAI}
              disabled={loading || !question.trim()}
              style={{
                marginTop: 14,
                width: "100%",
                border: 0,
                borderRadius: 15,
                padding: "15px 20px",
                background:
                  loading || !question.trim()
                    ? "#aebbd0"
                    : "#315ea8",
                color: "#fff",
                fontSize: 16,
                fontWeight: 800,
                cursor:
                  loading || !question.trim()
                    ? "default"
                    : "pointer",
              }}
            >
              {loading
                ? "در حال دریافت پاسخ هوشمند..."
                : "ارسال به تیم هوش مصنوعی"}
            </button>

            {answer && (
              <div
                style={{
                  marginTop: 18,
                  padding: 20,
                  borderRadius: 18,
                  background: "#ffffff",
                  border:
                    "1px solid #d9e3f2",
                  lineHeight: 2,
                  color: "#26344d",
                  whiteSpace: "pre-wrap",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: 8,
                    color: "#315ea8",
                  }}
                >
                  🤖 پاسخ صدایار
                </div>

                {answer}
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(190px,1fr))",
              gap: 14,
              marginTop: 24,
            }}
          >
            {[
              ["🧠", "مدیر هوشمند"],
              ["💬", "صدایار"],
              ["❓", "سؤالات بی‌پاسخ"],
              ["⚠️", "مسائل نیازمند توجه"],
              ["💡", "پیشنهادهای کارکنان"],
              ["📊", "گزارش هوشمند"],
              ["📚", "بانک دانش"],
              ["👁️", "مرکز نظارت"],
            ].map(([icon, title]) => (
              <div
                key={title}
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background: "#fff",
                  border:
                    "1px solid #e3eaf4",
                  boxShadow:
                    "0 5px 18px rgba(30,60,100,.05)",
                }}
              >
                <div style={{ fontSize: 25 }}>
                  {icon}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontWeight: 800,
                    color: "#26344d",
                  }}
                >
                  {title}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 15,
              background: "#eefaf3",
              color: "#26734d",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            ● سامانه آماده است
          </div>
        </div>
      </div>
    </main>
  );
}
