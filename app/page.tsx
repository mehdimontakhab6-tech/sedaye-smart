"use client";

import { useState } from "react";

const items = [
  ["🤖", "مدیر هوشمند", "تحلیل و پیگیری هوشمند پیام‌ها"],
  ["💬", "صدایار", "پاسخگویی بر پایه اطلاعات تأییدشده"],
  ["🔴", "مسائل نیازمند توجه", "موضوعات مهم در انتظار بررسی"],
  ["⚠️", "مسائل و دغدغه‌ها", "ثبت و دسته‌بندی دغدغه‌های کارکنان"],
  ["🔁", "مسائل پرتکرار", "شناسایی موضوعات مشابه"],
  ["💡", "پیشنهادهای کارکنان", "استخراج و پیگیری پیشنهادها"],
  ["🆔", "پرونده‌های مسائل", "پیگیری هر موضوع با شناسه اختصاصی"],
  ["🗳️", "نظرسنجی‌ها", "ساخت و مدیریت نظرسنجی"],
  ["📊", "گزارش هوشمند", "گزارش‌های روزانه، هفتگی و ماهانه"],
  ["📚", "بانک دانش", "اطلاعات و پاسخ‌های تأییدشده"],
  ["💬", "فرماندهی هوشمند", "فرمان‌های مدیریتی و تحلیل سریع"],
  ["⚙️", "تنظیمات", "تنظیمات سامانه و اتصال‌ها"]
];

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!question.trim()) return;

    setLoading(true);
    setAnswer("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      const data = await response.json();

      setAnswer(
        data.answer || "این موضوع نیازمند بررسی مدیر سامانه است."
      );
    } catch {
      setAnswer("ارتباط با صدایار برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <header className="top">
        <div>
          <div className="brand">🤖 صدای هوشمند</div>
          <p>سامانه هوشمند گروه «صدای کارکنان ثبت احوال»</p>
        </div>

        <span className="status">● سامانه آماده است</span>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">مرکز فرماندهی</span>

          <h1>هم صدایی برای تحول و بهبود</h1>

          <p>
            مدیریت هوشمند مسائل، پیشنهادها و دانش کارکنان
            در یک محیط یکپارچه.
          </p>
        </div>

        <div className="ask">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="از صدایار سؤال بپرسید..."
          />

          <button onClick={ask} disabled={loading}>
            {loading ? "در حال بررسی..." : "پرسش"}
          </button>
        </div>

        {answer && <div className="answer">{answer}</div>}
      </section>

      <section className="grid">
        {items.map(([icon, title, description]) => (
          <article className="card" key={title}>
            <div className="icon">{icon}</div>

            <h2>{title}</h2>

            <p>{description}</p>

            <span className="arrow">←</span>
          </article>
        ))}
      </section>
    </main>
  );
}
