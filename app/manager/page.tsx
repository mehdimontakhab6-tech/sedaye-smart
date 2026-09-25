"use client";

import { useState } from "react";

export default function ManagerPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function analyze() {
    if (!text.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/manager/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text
        })
      });

      const data = await response.json();
      setResult(data);
    } catch {
      setResult({
        ok: false,
        error: "ارتباط با مدیر هوشمند برقرار نشد."
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">

      <header className="top">

        <div>
          <div className="brand">
            🤖 مدیر هوشمند
          </div>

          <p>
            تحلیل، دسته‌بندی و مدیریت هوشمند پیام‌های کارکنان
          </p>
        </div>

        <a href="/" className="back">
          ← داشبورد
        </a>

      </header>

      <section className="hero">

        <div className="heroText">

          <span className="eyebrow">
            مرکز فرماندهی هوشمند
          </span>

          <h1>
            تحلیل پیام کارکنان
          </h1>

          <p>
            متن پیام را وارد کنید تا مدیر هوشمند آن را
            تحلیل و برای ثبت و پیگیری آماده کند.
          </p>

        </div>

      </section>

      <section className="managerPanel">

        <div className="managerHeader">

          <div>
            <span className="eyebrow">
              🤖 پردازش هوشمند
            </span>

            <h2>
              پیام جدید
            </h2>
          </div>

          <span className="managerStatus">
            آماده تحلیل
          </span>

        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="متن پیام یا مسئله کارکنان را اینجا وارد کنید..."
          style={{
            width: "100%",
            minHeight: "180px",
            border: "1px solid #dce5f4",
            borderRadius: "14px",
            padding: "15px",
            fontFamily: "inherit",
            fontSize: "14px",
            lineHeight: "2",
            resize: "vertical",
            outline: "none",
            boxSizing: "border-box"
          }}
        />

        <button
          onClick={analyze}
          disabled={loading || !text.trim()}
          style={{
            marginTop: "14px",
            border: "none",
            borderRadius: "12px",
            padding: "12px 22px",
            background: "#1769e0",
            color: "white",
            fontFamily: "inherit",
            fontWeight: "bold",
            cursor: "pointer",
            opacity: loading || !text.trim() ? 0.6 : 1
          }}
        >
          {loading
            ? "در حال تحلیل..."
            : "🤖 تحلیل پیام"}
        </button>

      </section>

      {result && (

        <section className="managerPanel">

          <div className="managerHeader">

            <div>
              <span className="eyebrow">
                نتیجه تحلیل
              </span>

              <h2>
                گزارش مدیر هوشمند
              </h2>
            </div>

          </div>

          {!result.ok ? (

            <div className="empty">
              {result.error}
            </div>

          ) : (

            <div className="managerGrid">

              <div>
                <strong>
                  {result.category}
                </strong>

                <span>
                  دسته‌بندی پیام
                </span>
              </div>

              <div>
                <strong>
                  {result.action}
                </strong>

                <span>
                  اقدام انجام‌شده
                </span>
              </div>

              <div>
                <strong>
                  {result.issue?.tracking_id ||
                    result.existing_issue?.tracking_id ||
                    "—"}
                </strong>

                <span>
                  شناسه پرونده
                </span>
              </div>

              <div>
                <strong>
                  بررسی انسانی
                </strong>

                <span>
                  تصمیم نهایی با مدیر سامانه
                </span>
              </div>

            </div>

          )}

          {result.issue && (
            <div className="issue" style={{ marginTop: "18px" }}>

              <span className="tracking">
                {result.issue.tracking_id}
              </span>

              <h2>
                {result.issue.title}
              </h2>

              <p>
                {result.issue.description}
              </p>

              <div className="issueMeta">

                <span>
                  وضعیت: {result.issue.status}
                </span>

                <span>
                  دسته‌بندی: {result.issue.category}
                </span>

              </div>

            </div>
          )}

          {result.existing_issue && (
            <div className="issue" style={{ marginTop: "18px" }}>

              <span className="tracking">
                پرونده مشابه پیدا شد
              </span>

              <h2>
                {result.existing_issue.title}
              </h2>

              <p>
                این پیام به یک مسئله ثبت‌شده شباهت دارد.
              </p>

              <div className="issueMeta">

                <span>
                  شناسه: {result.existing_issue.tracking_id}
                </span>

                <span>
                  میزان شباهت: {Math.round(
                    (result.similarity || 0) * 100
                  )}٪
                </span>

              </div>

            </div>
          )}

        </section>

      )}

    </main>
  );
          }
