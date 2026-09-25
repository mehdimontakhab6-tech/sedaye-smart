"use client";

import { useEffect, useState } from "react";

const menu = [
  ["🤖", "مدیر هوشمند", "تحلیل و مدیریت هوشمند"],
  ["💬", "صدایار", "پاسخگویی هوشمند کارکنان"],
  ["❓", "سؤالات بی‌پاسخ", "موضوعات نیازمند پاسخ"],
  ["🔴", "مسائل نیازمند توجه", "موضوعات مهم"],
  ["⚠️", "مسائل و دغدغه‌ها", "ثبت و پیگیری مسائل"],
  ["🔁", "مسائل پرتکرار", "موضوعات مشابه و تکراری"],
  ["💡", "پیشنهادهای کارکنان", "ایده‌ها و پیشنهادها"],
  ["🆔", "پرونده‌های مسائل", "پیگیری با شناسه اختصاصی"],
  ["🗳️", "نظرسنجی‌ها", "نظرسنجی از کارکنان"],
  ["📊", "گزارش هوشمند", "گزارش‌های تحلیلی"],
  ["📚", "بانک دانش", "اطلاعات تأییدشده"],
  ["💬", "فرماندهی هوشمند", "فرمان‌های مدیریتی"],
  ["⚙️", "تنظیمات", "تنظیمات سامانه"]
];

export default function Home() {
  const [active, setActive] = useState("داشبورد");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState({
    messages: 0,
    issues: 0,
    ideas: 0,
    polls: 0,
    unanswered: 0
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetch("/api/dashboard");
        const data = await response.json();

        if (data.stats) {
          setStats({
            messages: data.stats.messages ?? 0,
            issues: data.stats.issues ?? 0,
            ideas: data.stats.ideas ?? 0,
            polls: data.stats.polls ?? 0,
            unanswered: data.stats.unanswered ?? 0
          });
        }
      } catch {
        // در صورت نبود اتصال، آمار صفر باقی می‌ماند.
      }
    }

    loadStats();
  }, []);

  async function askAssistant() {
    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          question
        })
      });

      const data = await response.json();

      setAnswer(
        data.answer ||
          "پاسخ تأییدشده‌ای برای این سؤال پیدا نشد."
      );
    } catch {
      setAnswer(
        "ارتباط با صدایار برقرار نشد."
      );
    } finally {
      setLoading(false);
    }
  }

  function openSection(title: string) {
    if (title === "مدیر هوشمند") {
      window.location.href = "/manager";
      return;
    }

    if (title === "سؤالات بی‌پاسخ") {
      window.location.href = "/unanswered";
      return;
    }

    if (title === "پیشنهادهای کارکنان") {
      window.location.href = "/ideas";
      return;
    }

    if (title === "مسائل و دغدغه‌ها") {
      window.location.href = "/issues";
      return;
    }

    setActive(title);
  }

  return (
    <main className="page">

      <header className="top">

        <div>
          <div className="brand">
            🤖 صدای هوشمند
          </div>

          <p>
            سامانه هوشمند گروه «صدای کارکنان ثبت احوال»
          </p>
        </div>

        <div className="status">
          <span>●</span>
          سامانه آماده است
        </div>

      </header>

      <section className="hero">

        <div className="heroText">

          <span className="eyebrow">
            مرکز فرماندهی هوشمند
          </span>

          <h1>
            هم‌صدایی برای تحول و بهبود
          </h1>

          <p>
            مدیریت هوشمند مسائل، پیشنهادها، پرسش‌ها
            و دانش کارکنان در یک محیط یکپارچه.
          </p>

        </div>

        <div className="assistantBox">

          <div className="assistantTitle">

            <span>💬</span>

            <div>
              <strong>صدایار</strong>

              <small>
                پاسخگوی هوشمند کارکنان
              </small>
            </div>

          </div>

          <div className="ask">

            <input
              value={question}
              onChange={(e) =>
                setQuestion(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  askAssistant();
                }
              }}
              placeholder="سؤال خود را از صدایار بپرسید..."
            />

            <button
              onClick={askAssistant}
              disabled={loading}
            >
              {loading
                ? "در حال بررسی..."
                : "پرسش"}
            </button>

          </div>

          {answer && (
            <div className="answer">
              {answer}
            </div>
          )}

        </div>

      </section>

      <section className="stats">

        <div className="statCard">
          <span>📩</span>

          <div>
            <small>پیام‌های دریافتی</small>
            <strong>{stats.messages}</strong>
          </div>
        </div>

        <div className="statCard">
          <span>⚠️</span>

          <div>
            <small>مسائل ثبت‌شده</small>
            <strong>{stats.issues}</strong>
          </div>
        </div>

        <div className="statCard">
          <span>💡</span>

          <div>
            <small>پیشنهادهای کارکنان</small>
            <strong>{stats.ideas}</strong>
          </div>
        </div>

        <div className="statCard">
          <span>🗳️</span>

          <div>
            <small>نظرسنجی‌های فعال</small>
            <strong>{stats.polls}</strong>
          </div>
        </div>

        <div className="statCard">
          <span>❓</span>

          <div>
            <small>سؤالات بی‌پاسخ</small>
            <strong>{stats.unanswered}</strong>
          </div>
        </div>

      </section>

      <section className="managerPanel">

        <div className="managerHeader">

          <div>
            <span className="eyebrow">
              🤖 مدیر هوشمند
            </span>

            <h2>
              وضعیت سامانه
            </h2>
          </div>

          <span className="managerStatus">
            آماده تحلیل
          </span>

        </div>

        <div className="managerGrid">

          <div>
            <strong>
              {stats.issues}
            </strong>

            <span>
              پرونده مسئله
            </span>
          </div>

          <div>
            <strong>
              {stats.ideas}
            </strong>

            <span>
              پیشنهاد ثبت‌شده
            </span>
          </div>

          <div>
            <strong>
              {stats.messages}
            </strong>

            <span>
              پیام دریافتی
            </span>
          </div>

          <div>
            <strong>
              {stats.unanswered}
            </strong>

            <span>
              سؤال نیازمند بررسی
            </span>
          </div>

        </div>

      </section>

      <div className="sectionTitle">

        <div>
          <span>
            مرکز مدیریت
          </span>

          <h2>
            ابزارهای هوشمند سامانه
          </h2>
        </div>

      </div>

      <section className="grid">

        {menu.map(
          ([icon, title, description]) => (

            <button
              className="card"
              key={title}
              onClick={() =>
                openSection(title)
              }
            >

              <div className="icon">
                {icon}
              </div>

              <div className="cardText">

                <h3>
                  {title}
                </h3>

                <p>
                  {description}
                </p>

              </div>

              <span className="arrow">
                ←
              </span>

            </button>

          )
        )}

      </section>

      {active !== "داشبورد" && (

        <section className="selected">

          <div className="selectedIcon">
            🔹
          </div>

          <div>

            <span>
              بخش انتخاب‌شده
            </span>

            <h2>
              {active}
            </h2>

            <p>
              این بخش آماده اتصال به داده‌ها و
              امکانات اختصاصی سامانه است.
            </p>

          </div>

        </section>

      )}

      <footer>

        <strong>
          صدای هوشمند
        </strong>

        <span>
          هم‌صدایی برای تحول و بهبود
        </span>

      </footer>

    </main>
  );
            }
