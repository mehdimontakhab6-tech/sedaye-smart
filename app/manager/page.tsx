"use client";

import { useEffect, useState } from "react";

type ScheduleKind =
  | "calendar"
  | "news"
  | "kargozin";

const schedules = [
  {
    kind: "calendar" as ScheduleKind,
    title: "📅 تقویم روزانه",
    time: "۰۸:۱۵ تهران",
    description:
      "ارسال خودکار تقویم روزانه، مناسبت‌ها و زمان واقعی ارسال",
    cancelLabel: "🛑 لغو تقویم",
    enableLabel: "▶️ فعال‌سازی تقویم",
  },
  {
    kind: "news" as ScheduleKind,
    title: "📰 ثبت احوال در رسانه‌ها",
    time: "۲۲:۳۰ تهران",
    description:
      "خلاصه روزانه اخبار ثبت احوال از رسانه‌های معتبر",
    cancelLabel: "🛑 لغو اخبار ثبت احوال",
    enableLabel: "▶️ فعال‌سازی اخبار ثبت احوال",
  },
  {
    kind: "kargozin" as ScheduleKind,
    title: "📚 مجله کارگزینی",
    time: "⏱ بررسی هر دقیقه",
    description:
      "بررسی خودکار مطالب جدید مجله کارگزینی و ارسال مطالب جدید به گروه",
    cancelLabel: "🛑 خاموش کردن مجله کارگزینی",
    enableLabel: "▶️ روشن کردن مجله کارگزینی",
  },
];

export default function ManagerPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [states, setStates] = useState<
    Record<ScheduleKind, boolean>
  >({
    calendar: true,
    news: true,
    kargozin: true,
  });

  const [saving, setSaving] =
    useState<ScheduleKind | null>(null);

  const [message, setMessage] = useState("");

  async function analyze() {
    if (!text.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/manager/process",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
          }),
        }
      );

      const data = await response.json();
      setResult(data);
    } catch {
      setResult({
        ok: false,
        error:
          "ارتباط با مدیر هوشمند برقرار نشد.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadScheduleState() {
    try {
      const response = await fetch(
        "/api/schedule/control",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (data?.ok) {
        setStates({
          calendar:
            data.calendar !== false,
          news:
            data.news !== false,
          kargozin:
            data.kargozin !== false,
        });
      }
    } catch {
      // در صورت خطا، وضعیت پیش‌فرض فعال باقی می‌ماند.
    }
  }

  useEffect(() => {
    loadScheduleState();
  }, []);

  async function toggleSchedule(
    kind: ScheduleKind
  ) {
    const next = !states[kind];

    const schedule = schedules.find(
      (item) => item.kind === kind
    );

    const actionLabel = next
      ? schedule?.enableLabel ||
        "فعال‌سازی ارسال"
      : schedule?.cancelLabel ||
        "لغو ارسال";

    const confirmed = window.confirm(
      next
        ? `«${actionLabel}» انجام شود؟`
        : `آیا «${actionLabel}» انجام شود؟`
    );

    if (!confirmed) return;

    setSaving(kind);
    setMessage("");

    try {
      const response = await fetch(
        "/api/schedule/control",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            schedule: kind,
            enabled: next,
          }),
        }
      );

      const data = await response.json();

      if (
        !response.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.error ||
            "ثبت وضعیت زمان‌بندی انجام نشد."
        );
      }

      setStates((current) => ({
        ...current,
        [kind]: next,
      }));

      setMessage(
        next
          ? `✅ ${schedule?.title || "ارسال"} فعال شد.`
          : `🛑 ${schedule?.title || "ارسال"} لغو شد.`
      );
    } catch (error: any) {
      setMessage(
        error?.message ||
          "خطا در ثبت وضعیت."
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="page">

      {/* HEADER */}
      <header className="top">

        <div>
          <div className="brand">
            🤖 مدیر هوشمند
          </div>

          <p>
            تحلیل، مدیریت و نظارت هوشمند
            سامانه صدای کارکنان
          </p>
        </div>

        <a
          href="/"
          className="back"
        >
          ← داشبورد
        </a>

      </header>

      {/* HERO */}
      <section className="hero">

        <div className="heroText">

          <span className="eyebrow">
            👁️ مرکز نظارت
          </span>

          <h1>
            مدیریت هوشمند گروه
          </h1>

          <p>
            تقویم روزانه و اخبار
            «ثبت احوال در رسانه‌ها»
            از همین پنل مدیریت می‌شوند.
          </p>

        </div>

      </section>

      {/* SCHEDULE CONTROL */}
      <section className="managerPanel">

        <div className="managerHeader">

          <div>

            <span className="eyebrow">
              📋 ارسال‌های زمان‌بندی‌شده
            </span>

            <h2>
              کنترل ارسال خودکار
            </h2>

          </div>

          <span className="managerStatus">
            کنترل فعال
          </span>

        </div>

        {schedules.map(
          (schedule) => {

            const enabled =
              states[
                schedule.kind
              ];

            return (

              <div
                key={schedule.kind}
                style={{
                  border:
                    "1px solid #dce5f4",
                  borderRadius: "16px",
                  padding: "16px",
                  marginTop: "14px",
                }}
              >

                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    gap: "12px",
                    alignItems:
                      "center",
                  }}
                >

                  <div>

                    <strong
                      style={{
                        display:
                          "block",
                        fontSize:
                          "17px",
                      }}
                    >
                      {schedule.title}
                    </strong>

                    <span
                      style={{
                        display:
                          "block",
                        marginTop:
                          "6px",
                        color:
                          "#667085",
                      }}
                    >
                      {
                        schedule.description
                      }
                    </span>

                    <span
                      style={{
                        display:
                          "block",
                        marginTop:
                          "6px",
                        fontWeight:
                          "bold",
                      }}
                    >
                      ⏰ {schedule.time}
                    </span>

                  </div>

                  <span
                    style={{
                      whiteSpace:
                        "nowrap",
                      padding:
                        "6px 10px",
                      borderRadius:
                        "999px",
                      background:
                        enabled
                          ? "#e8f7ee"
                          : "#fff1f0",
                      color:
                        enabled
                          ? "#18794e"
                          : "#c62828",
                    }}
                  >
                    {enabled
                      ? "فعال"
                      : "لغوشده"}
                  </span>

                </div>

                {/* دکمه اختصاصی لغو/فعال‌سازی */}
                <button
                  type="button"
                  onClick={() =>
                    toggleSchedule(
                      schedule.kind
                    )
                  }
                  disabled={
                    saving ===
                    schedule.kind
                  }
                  style={{
                    marginTop:
                      "14px",
                    width: "100%",
                    border: "none",
                    borderRadius:
                      "12px",
                    padding:
                      "12px",
                    background:
                      enabled
                        ? "#c62828"
                        : "#1769e0",
                    color: "#fff",
                    fontFamily:
                      "inherit",
                    fontWeight:
                      "bold",
                    fontSize:
                      "15px",
                    cursor:
                      saving ===
                      schedule.kind
                        ? "wait"
                        : "pointer",
                    opacity:
                      saving ===
                      schedule.kind
                        ? 0.65
                        : 1,
                  }}
                >
                  {saving ===
                  schedule.kind
                    ? "در حال ثبت..."
                    : enabled
                    ? schedule.cancelLabel
                    : schedule.enableLabel}
                </button>

              </div>

            );
          }
        )}

        {message && (

          <div
            style={{
              marginTop:
                "14px",
              padding:
                "12px",
              borderRadius:
                "12px",
              background:
                "#f5f7fb",
              lineHeight:
                "2",
            }}
          >
            {message}
          </div>

        )}

      </section>

      {/* SMART ASSISTANT */}
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
          onChange={(e) =>
            setText(e.target.value)
          }
          placeholder="متن پیام یا مسئله کارکنان را اینجا وارد کنید..."
          rows={7}
          style={{
            width: "100%",
            border:
              "1px solid #dce5f4",
            borderRadius:
              "14px",
            padding:
              "15px",
            fontFamily:
              "inherit",
            fontSize:
              "14px",
            lineHeight:
              "2",
            resize:
              "vertical",
            outline:
              "none",
            boxSizing:
              "border-box",
          }}
        />

        <button
          type="button"
          onClick={analyze}
          disabled={
            loading ||
            !text.trim()
          }
          style={{
            marginTop:
              "14px",
            border: "none",
            borderRadius:
              "12px",
            padding:
              "12px 22px",
            background:
              "#1769e0",
            color:
              "white",
            fontFamily:
              "inherit",
            fontWeight:
              "bold",
            cursor:
              "pointer",
            opacity:
              loading ||
              !text.trim()
                ? 0.6
                : 1,
          }}
        >
          {loading
            ? "در حال تحلیل..."
            : "🤖 تحلیل پیام"}
        </button>

      </section>

      {/* ANALYSIS RESULT */}
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
                  {
                    result.issue
                      ?.tracking_id ||
                    result
                      .existing_issue
                      ?.tracking_id ||
                    "—"
                  }
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

            <div
              className="issue"
              style={{
                marginTop:
                  "18px",
              }}
            >

              <span className="tracking">
                {
                  result.issue
                    .tracking_id
                }
              </span>

              <h2>
                {
                  result.issue
                    .title
                }
              </h2>

              <p>
                {
                  result.issue
                    .description
                }
              </p>

              <div className="issueMeta">

                <span>
                  وضعیت:{" "}
                  {
                    result.issue
                      .status
                  }
                </span>

                <span>
                  دسته‌بندی:{" "}
                  {
                    result.issue
                      .category
                  }
                </span>

              </div>

            </div>

          )}

          {result.existing_issue && (

            <div
              className="issue"
              style={{
                marginTop:
                  "18px",
              }}
            >

              <span className="tracking">
                پرونده مشابه پیدا شد
              </span>

              <h2>
                {
                  result
                    .existing_issue
                    .title
                }
              </h2>

              <p>
                این پیام به یک
                مسئله ثبت‌شده
                شباهت دارد.
              </p>

              <div className="issueMeta">

                <span>
                  شناسه:{" "}
                  {
                    result
                      .existing_issue
                      .tracking_id
                  }
                </span>

                <span>
                  میزان شباهت:{" "}
                  {
                    Math.round(
                      (
                        result
                          .similarity ||
                        0
                      ) * 100
                    )
                  }٪
                </span>

              </div>

            </div>

          )}

        </section>

      )}

    </main>
  );
          }
