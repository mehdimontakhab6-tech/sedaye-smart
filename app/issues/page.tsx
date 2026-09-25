"use client";

import { useEffect, useState } from "react";

type Issue = {
  id: string;
  tracking_id: string | null;
  title: string;
  description: string | null;
  status: string;
  category: string | null;
  created_at: string;
};

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIssues() {
      try {
        const response = await fetch("/api/issues");
        const data = await response.json();

        setIssues(data.issues ?? []);
      } catch {
        setIssues([]);
      } finally {
        setLoading(false);
      }
    }

    loadIssues();
  }, []);

  return (
    <main className="page">

      <header className="top">
        <div>
          <div className="brand">
            ⚠️ مسائل و دغدغه‌ها
          </div>

          <p>
            ثبت، دسته‌بندی و پیگیری مسائل کارکنان
          </p>
        </div>

        <a href="/" className="back">
          ← داشبورد
        </a>
      </header>

      <section className="hero">
        <span className="eyebrow">
          مدیریت مسائل
        </span>

        <h1>
          پرونده‌های مسائل و دغدغه‌ها
        </h1>

        <p>
          موضوعات ثبت‌شده در این بخش برای بررسی،
          پیگیری و تصمیم‌گیری مدیریتی نمایش داده می‌شوند.
        </p>
      </section>

      {loading ? (
        <div className="empty">
          در حال دریافت اطلاعات...
        </div>
      ) : issues.length === 0 ? (
        <div className="empty">
          هنوز مسئله‌ای در سامانه ثبت نشده است.
        </div>
      ) : (
        <section className="issueList">

          {issues.map((issue) => (
            <article className="issue" key={issue.id}>

              <div className="issueTop">

                <div>
                  <span className="tracking">
                    {issue.tracking_id ?? "بدون شناسه"}
                  </span>

                  <h2>
                    {issue.title}
                  </h2>
                </div>

                <span className="issueStatus">
                  {issue.status}
                </span>

              </div>

              {issue.description && (
                <p>
                  {issue.description}
                </p>
              )}

              <div className="issueMeta">

                <span>
                  دسته‌بندی: {issue.category ?? "تعیین نشده"}
                </span>

                <span>
                  {new Date(issue.created_at).toLocaleDateString(
                    "fa-IR"
                  )}
                </span>

              </div>

            </article>
          ))}

        </section>
      )}

    </main>
  );
}
