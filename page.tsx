"use client";

import { useState } from "react";

const cards = [
  ["🤖", "مدیر هوشمند", "تحلیل، دسته‌بندی و پیگیری هوشمند پیام‌ها"],
  ["💬", "صدایار", "پاسخگویی بر پایه اطلاعات تأییدشده"],
  ["🔴", "مسائل نیازمند توجه", "موضوعاتی که نیازمند بررسی هستند"],
  ["⚠️", "مسائل و دغدغه‌ها", "ثبت و تحلیل دغدغه‌های کارکنان"],
  ["🔁", "مسائل پرتکرار", "شناسایی موضوعات مشابه و تکرارشونده"],
  ["💡", "پیشنهادهای کارکنان", "استخراج و پیگیری پیشنهادهای سازنده"],
  ["🆔", "پرونده‌های مسائل", "پیگیری وضعیت هر موضوع با شناسه اختصاصی"],
  ["🗳️", "نظرسنجی‌ها", "پیشنهاد و مدیریت نظرسنجی‌های گروه"],
  ["📊", "گزارش هوشمند", "گزارش‌های روزانه، هفتگی و ماهانه"],
  ["📚", "بانک دانش", "اطلاعات و پاسخ‌های تأییدشده"],
  ["💬", "فرماندهی هوشمند", "فرمان‌های مدیریتی برای تحلیل سریع"],
  ["⚙️", "تنظیمات", "تنظیمات سامانه و اتصال‌ها"],
];

export default function Home() {
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [loading, setLoading] = useState(false);

  async function ask() {
    if (!q.trim()) return;

    setLoading(true);
    setA("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: q,
        }),
      });

      const data = await response.json();

      setA(
        data.answer ||
          "این موضوع نیازمند بررسی مدیر سامانه است."
      );
    } catch {
      setA("ارتباط با دستیار برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page" dir="rtl">
      <header className="top">
        <div className="brand">
          <div className="brandMark">🤖</div>

          <div>
            <div className="eyebrow">
              SMART EMPLOYEE VOICE
            </div>

            <h1>صدای هوشمند</h1>

            <p>
              سامانه هوشمند گروه «صدای کارکنان ثبت احوال»
            </p>
          </div>
        </div>

        <span className="status">
          ● سامانه آماده است
        </span>
      </header>

      <section className="hero">
        <div className="heroContent">
          <span className="badge">
            ✨ دستیار هوشمند کارکنان
          </span>

          <h2>
            ایده‌ها، مسائل و صدای کارکنان؛{" "}
            <strong>هوشمندتر و هدفمندتر</strong>
          </h2>

          <p>
            یک فضای یکپارچه برای ثبت، تحلیل، پیگیری و تبدیل
            دیدگاه‌های کارکنان به پیشنهادهای قابل پیگیری.
          </p>

          <div className="ask">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && ask()
              }
              placeholder="مثلاً: مراحل پیگیری یک موضوع چگونه است؟"
            />

            <button onClick={ask} disabled={loading}>
              {loading
                ? "در حال بررسی..."
                : "پرسش از صدایار"}
            </button>
          </div>

          {a && <div className="answer">{a}</div>}
        </div>

        <div className="heroRobot">🤖</div>
      </section>

      <section className="sectionHead">
        <div>
          <span>امکانات سامانه</span>

          <h2>
            همه‌چیز برای یک صدای هوشمند
          </h2>
        </div>

        <p>
          از ثبت مسئله تا تحلیل و پیگیری، در یک محیط ساده و حرفه‌ای.
        </p>
      </section>

      <section className="grid">
        {cards.map(([icon, title, description]) => (
          <div className="card" key={title}>
            <div className="icon">{icon}</div>

            <h3>{title}</h3>

            <p>{description}</p>
          </div>
        ))}
      </section>

      <footer>
        <strong>صدای کارکنان ثبت احوال</strong>

        <span>
          هم‌صدایی برای تحول و بهبود
        </span>
      </footer>
    </main>
  );
}
