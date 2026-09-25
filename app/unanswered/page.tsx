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

         
