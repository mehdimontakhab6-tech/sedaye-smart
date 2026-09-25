"use client";

import { useEffect, useState } from "react";

type Idea = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  created_at: string;
};

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIdeas() {
      try {
        const response = await fetch("/api/ideas");
        const data = await response.json();

        setIdeas(data.ideas ?? []);
      } catch {
        setIdeas([]);
      } finally {
        setLoading(false);
      }
    }

    loadIdeas();
  }, []);

  return (
    <main className="page">

      <header className="top">
        <div>
          <div className="brand">
            💡 پیشنهادهای کارکنان
          </div>

          <p>
            ثبت، بررسی و پیگیری ایده‌ها و پیشنهادهای کارکنان
          </p>
        </div>

        <a href="/" className="back">
          ← داشبورد
        </a>
      </header>

      <section className="hero">

        <div className="heroText">

          <span className="eyebrow">
            مرکز پیشنهادها
          </span>

          <h1>
            ایده‌ها و پیشنهادهای کارکنان
          </h1>

          <p>
            پیشنهادهای ثبت‌شده در این بخش برای بررسی،
            تحلیل و تبدیل به اقدام قابل پیگیری نمایش داده می‌شوند.
          </p>

        </div>

      </section>

      {loading ? (

        <div className="empty">
          در حال دریافت اطلاعات...
        </div>

      ) : ideas.length === 0 ? (

        <div className="empty">
          هنوز پیشنهادی در سامانه ثبت نشده است.
        </div>

      ) : (

        <section className="issueList">

          {ideas.map((idea) => (

            <article
              className="issue"
              key={idea.id}
            >

              <div className="issueTop">

                <div>

                  <span className="tracking">
                    پیشنهاد کارکنان
                  </span>

                  <h2>
                    {idea.title}
                  </h2>

                </div>

                <span className="issueStatus">
                  جدید
                </span>

              </div>

              {idea.description && (

                <p>
                  {idea.description}
                </p>

              )}

              <div className="issueMeta">

                <span>
                  دسته‌بندی:{" "}
                  {idea.category ?? "تعیین نشده"}
                </span>

                <span>
                  {new Date(
                    idea.created_at
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
