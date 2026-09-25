"use client";

import { useEffect, useState } from "react";

type Question = {
  id: string;
  question: string;
  status: string;
  answer: string | null;
  approved: boolean;
  created_at: string;
};

export default function UnansweredPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadQuestions() {
    try {
      const response = await fetch("/api/unanswered");
      const data = await response.json();

      setQuestions(data.questions ?? []);
    } catch {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQuestions();
  }, []);

  async function saveAnswer(id: string) {
    const answer = answers[id]?.trim();

    if (!answer) {
      setMessage("لطفاً پاسخ را وارد کنید.");
      return;
    }

    setSaving(id);
    setMessage("");

    try {
      const response = await fetch("/api/unanswered", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id,
          answer
        })
      });

      const data = await response.json();

      if (!data.ok) {
        setMessage(
          data.error || "ثبت پاسخ انجام نشد."
        );
        return;
      }

      setMessage("پاسخ با موفقیت ثبت شد.");

      await loadQuestions();

      setAnswers((current) => ({
        ...current,
        [id]: ""
      }));
    } catch {
      setMessage("ارتباط با سامانه برقرار نشد.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="page">

      <header className="top">

        <div>
          <div className="brand">
            ❓ سؤالات بی‌پاسخ
          </div>

          <p>
            بررسی سؤالاتی که هنوز پاسخ تأییدشده ندارند
          </p>
        </div>

        <a href="/" className="back">
          ← داشبورد
        </a>

      </header>

      <section className="hero">

        <div className="heroText">

          <span className="eyebrow">
            📚 تکمیل بانک دانش
          </span>

          <h1>
            سؤالات نیازمند پاسخ
          </h1>

          <p>
            سؤالات بی‌پاسخ را بررسی کنید و پس از
            تأیید، پاسخ آنها را در بانک دانش ثبت کنید.
          </p>

        </div>

      </section>

      {message && (
        <div className="empty">
          {message}
        </div>
      )}

      {loading ? (

        <div className="empty">
          در حال دریافت سؤالات...
        </div>

      ) : questions.length === 0 ? (

        <div className="empty">
          🎉 در حال حاضر سؤال بی‌پاسخی ثبت نشده است.
        </div>

      ) : (

        <section className="issueList">

          {questions.map((item) => (

            <article
              className="issue"
              key={item.id}
            >

              <div className="issueTop">

                <div>

                  <span className="tracking">
                    سؤال نیازمند بررسی
                  </span>

                  <h2>
                    {item.question}
                  </h2>

                </div>

                <span className="issueStatus">
                  {item.status}
                </span>

              </div>

              <textarea
                value={
                  answers[item.id] ??
                  item.answer ??
                  ""
                }
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    [item.id]: e.target.value
                  })
                }
                placeholder="پاسخ تأییدشده را وارد کنید..."
                style={{
                  width: "100%",
                  minHeight: "130px",
                  marginTop: "18px",
                  padding: "14px",
                  border: "1px solid #dce5f4",
                  borderRadius: "14px",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  lineHeight: "2",
                  resize: "vertical",
                  boxSizing: "border-box"
                }}
              />

              <button
                onClick={() => saveAnswer(item.id)}
                disabled={saving === item.id}
                style={{
                  marginTop: "12px",
                  border: "none",
                  borderRadius: "12px",
                  padding: "11px 18px",
                  background: "#1769e0",
                  color: "white",
                  fontFamily: "inherit",
                  fontWeight: "bold",
                  cursor: "pointer",
                  opacity:
                    saving === item.id ? 0.6 : 1
                }}
              >
                {saving === item.id
                  ? "در حال ثبت..."
                  : "ثبت پاسخ"}
              </button>

              <div className="issueMeta">

                <span>
                  وضعیت: {item.status}
                </span>

                <span>
                  {new Date(
                    item.created_at
                  ).toLocaleDateString("fa-IR")}
                </span>

              </div>

            </article>

          ))}

        </section>

      )}

    </main>
  );
}
