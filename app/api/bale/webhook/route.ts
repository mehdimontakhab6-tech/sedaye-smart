
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { POST as assistantPost } from "../../assistant/route";

const KNOWN_BALE_BOT_ID = "502859097";
const KNOWN_BALE_BOT_USERNAME = "mmm532bot";
const BALE_MAX_MESSAGE_LENGTH = 4000;
const STREAM_EDIT_MIN_CHARS = 25;
const STREAM_EDIT_INTERVAL_MS = 700;

function normalizeUsername(value: unknown): string {
  return String(value ?? "")
    .replace(/^@/, "")
    .toLowerCase();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isKnownBot(
  sender: any,
  configuredBotId: unknown
): boolean {
  if (!sender || typeof sender !== "object") {
    return false;
  }

  const username = normalizeUsername(
    sender.username ?? sender.user_name
  );

  const id =
    sender.id ??
    sender.user_id ??
    sender.sender_id;

  return (
    sender.is_bot === true ||
    username === KNOWN_BALE_BOT_USERNAME ||
    (
      id != null &&
      (
        String(id) === KNOWN_BALE_BOT_ID ||
        (
          configuredBotId != null &&
          String(id) === String(configuredBotId)
        )
      )
    )
  );
}

/**
 * استخراج متن از رویدادهای SSE.
 * قالب رایج خروجی Workers AI شامل فیلد response است.
 */
function extractStreamText(item: any): string {
  if (typeof item?.response === "string") {
    return item.response;
  }

  if (typeof item?.choices?.[0]?.delta?.content === "string") {
    return item.choices[0].delta.content;
  }

  if (typeof item?.choices?.[0]?.message?.content === "string") {
    return item.choices[0].message.content;
  }

  if (typeof item?.text === "string") {
    return item.text;
  }

  return "";
}

/**
 * خواندن خروجی SSE به‌صورت جریانی.
 * متن کامل برگردانده می‌شود و هر قطعه نیز به callback می‌رسد.
 */
async function readAssistantStream(
  response: Response,
  onText: (chunk: string) => Promise<void>
): Promise<string> {
  if (!response.body) {
    throw new Error("بدنه پاسخ جریانی خالی است.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let answer = "";

  async function processLine(line: string): Promise<void> {
    const trimmed = line.trim();

    if (!trimmed.startsWith("data:")) {
      return;
    }

    const data = trimmed.slice(5).trim();

    if (!data || data === "[DONE]") {
      return;
    }

    let parsed: any;

    try {
      parsed = JSON.parse(data);
    } catch {
      // ممکن است خط، رویداد ناقص یا غیر JSON باشد.
      return;
    }

    if (
      parsed?.error ||
      parsed?.ok === false
    ) {
      throw new Error(
        typeof parsed?.error === "string"
          ? parsed.error
          : "مدل در حین تولید پاسخ خطا برگرداند."
      );
    }

    const chunk = extractStreamText(parsed);

    if (!chunk) {
      return;
    }

    answer += chunk;
    await onText(chunk);
  }

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        await processLine(line);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      await processLine(buffer);
    }

    return answer.trim();
  } finally {
    reader.releaseLock();
  }
}

async function callBaleApi(
  token: string,
  method: string,
  payload: Record<string, unknown>
): Promise<{ httpOk: boolean; data: any }> {
  const response = await fetch(
    `https://tapi.bale.ai/bot${token}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json().catch(() => null);

  return {
    httpOk: response.ok,
    data,
  };
}

export async function POST(req: Request) {
  let stage = "initialize";
  let supabase: any = null;

  let claimCreated = false;
  let requestClaimCreated = false;
  let sendAttempted = false;

  let claimChatId = "";
  let claimMessageId = "";
  let requestClaimKey = "";

  // برای مدیریت خطا پس از ارسال پیام اولیه.
  let streamToken: string | null = null;
  let streamMessageId: number | null = null;

  const ignored = (
    reason: string,
    details: Record<string, unknown> = {}
  ) =>
    NextResponse.json({
      ok: true,
      ignored: true,
      reason,
      ...details,
    });

  try {
    stage = "cloudflare_context";

    const { env } = await getCloudflareContext({
      async: true,
    });

    const secret = env?.BALE_WEBHOOK_SECRET;

    if (
      secret &&
      req.headers.get("x-bale-secret") !== secret
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "دسترسی غیرمجاز",
        },
        { status: 401 }
      );
    }

    stage = "parse_payload";

    const payload: any = await req
      .json()
      .catch(() => null);

    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "بدنه درخواست معتبر نیست.",
        },
        { status: 400 }
      );
    }

    const message: any =
      payload.message ??
      payload.edited_message ??
      payload;

    const text = [
      message?.text,
      message?.body,
      message?.caption,
      payload?.text,
    ].find(
      (value) =>
        typeof value === "string" &&
        value.trim().length > 0
    );

    const chatId =
      message?.chat?.id ??
      message?.chat_id ??
      payload?.chat_id ??
      payload?.chat?.id ??
      null;

    const messageId =
      message?.message_id ??
      message?.id ??
      payload?.message_id ??
      null;

    const senderObject =
      message?.from ??
      message?.sender ??
      payload?.from ??
      payload?.sender ??
      {};

    const senderId =
      senderObject?.id ??
      senderObject?.user_id ??
      senderObject?.sender_id ??
      null;

    const configuredBotId = (
      env as unknown as Record<string, unknown>
    )?.BALE_BOT_ID;

    const replyToMessageId =
      message?.reply_to_message?.message_id ??
      message?.reply_to_message?.id ??
      message?.reply_to_message_id ??
      null;

    console.log(
      "[BALE_INCOMING_DIAGNOSTIC]",
      JSON.stringify({
        update_id: payload?.update_id ?? null,
        message_id: messageId ?? null,
        chat_id: chatId ?? null,
        text:
          typeof text === "string"
            ? text.slice(0, 200)
            : null,
        sender_id: senderId ?? null,
        sender_username:
          senderObject?.username ??
          senderObject?.user_name ??
          null,
        sender_is_bot:
          senderObject?.is_bot ?? null,
        message_date: message?.date ?? null,
        reply_to_message_id: replyToMessageId,
      })
    );

    if (isKnownBot(senderObject, configuredBotId)) {
      return ignored("bot_message");
    }

    if (typeof text !== "string" || !text.trim()) {
      return ignored("no_text");
    }

    const normalizedText = normalizeText(text);

    if (!/مدیر\s*هوشمند/u.test(normalizedText)) {
      return ignored("assistant_not_mentioned");
    }

    if (
      chatId === null ||
      chatId === undefined ||
      messageId === null ||
      messageId === undefined ||
      String(messageId).trim() === ""
    ) {
      return ignored("missing_message_identity");
    }

    const allowedGroupId = String(
      env?.BALE_GROUP_ID || "4554953620"
    );

    if (String(chatId) !== allowedGroupId) {
      return ignored("group_not_allowed");
    }

    stage = "supabase_config";

    const supabaseUrl =
      env?.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseKey =
      env?.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase configuration is incomplete"
      );
    }

    supabase = createClient(
      supabaseUrl,
      supabaseKey
    );

    claimChatId = String(chatId);
    claimMessageId = String(messageId);

    // اگر پیام والد، پاسخ خروجی خود ربات باشد، پردازش نکن.
    if (
      replyToMessageId !== null &&
      replyToMessageId !== undefined &&
      String(replyToMessageId).trim() !== ""
    ) {
      stage = "check_reply_to_bot";

      const {
        data: sentParent,
        error: sentParentError,
      } = await supabase
        .from("bale_sent_messages")
        .select("message_id")
        .eq("chat_id", claimChatId)
        .eq("message_id", String(replyToMessageId))
        .maybeSingle();

      if (sentParentError) {
        console.error(
          "[BALE_SENT_PARENT_CHECK_ERROR]",
          {
            code: sentParentError.code ?? null,
            message: sentParentError.message,
          }
        );

        throw new Error(
          "Could not verify reply target"
        );
      }

      if (sentParent) {
        console.log(
          "[BALE_REPLY_TO_OWN_MESSAGE_IGNORED]",
          JSON.stringify({
            chat_id: claimChatId,
            message_id: claimMessageId,
            reply_to_message_id: String(replyToMessageId),
          })
        );

        return ignored("reply_to_bot_message");
      }
    }

    // لایه اول: جلوگیری از پردازش دوباره همان شناسه.
    stage = "claim_message";

    const { error: claimError } = await supabase
      .from("bale_processed_messages")
      .insert({
        chat_id: claimChatId,
        message_id: claimMessageId,
      });

    if (claimError?.code === "23505") {
      console.log(
        "[BALE_DUPLICATE_IGNORED]",
        JSON.stringify({
          chat_id: claimChatId,
          message_id: claimMessageId,
        })
      );

      return ignored("duplicate_message");
    }

    if (claimError) {
      console.error(
        "[BALE_WEBHOOK_CLAIM_ERROR]",
        {
          code: claimError.code,
          message: claimError.message,
        }
      );

      throw new Error(
        "Could not register message for deduplication"
      );
    }

    claimCreated = true;

    // لایه دوم: جلوگیری از رویداد معادل با شناسه متفاوت.
    const messageDate = Number(message?.date);

    if (
      Number.isFinite(messageDate) &&
      messageDate > 0 &&
      senderId !== null &&
      senderId !== undefined
    ) {
      stage = "claim_equivalent_request";

      requestClaimKey = await sha256(
        [
          claimChatId,
          String(senderId),
          normalizedText.toLowerCase(),
          String(messageDate),
          String(replyToMessageId ?? ""),
        ].join("|")
      );

      const {
        error: requestClaimError,
      } = await supabase
        .from("bale_processed_requests")
        .insert({
          request_key: requestClaimKey,
        });

      if (requestClaimError?.code === "23505") {
        console.log(
          "[BALE_EQUIVALENT_REQUEST_IGNORED]",
          JSON.stringify({
            chat_id: claimChatId,
            message_id: claimMessageId,
            sender_id: senderId,
            message_date: messageDate,
          })
        );

        return ignored("duplicate_equivalent_request");
      }

      if (requestClaimError) {
        console.error(
          "[BALE_REQUEST_CLAIM_ERROR]",
          {
            code: requestClaimError.code ?? null,
            message: requestClaimError.message,
          }
        );

        throw new Error(
          "Could not register equivalent request"
        );
      }

      requestClaimCreated = true;
    }

    // ثبت پیام ورودی در سابقه.
    stage = "supabase_insert";

    const {
      data: savedMessage,
      error: saveError,
    } = await supabase
      .from("messages")
      .insert({
        text: text.trim(),
        source: "bale",
        raw_data: payload,
      })
      .select("id")
      .single();

    if (saveError) {
      console.error(
        "[BALE_WEBHOOK_SAVE_ERROR]",
        {
          code: saveError.code ?? null,
          message: saveError.message,
        }
      );

      throw new Error(
        "ثبت پیام در Supabase ناموفق بود."
      );
    }

    stage = "bale_config";

    const token = env?.BALE_SMART_TOKEN;

    if (!token) {
      throw new Error(
        "BALE_SMART_TOKEN تنظیم نشده است."
      );
    }

    streamToken = token;

    const numericMessageId = Number(messageId);

    if (
      !Number.isSafeInteger(numericMessageId) ||
      numericMessageId <= 0
    ) {
      throw new Error(
        `Invalid Bale message ID: ${String(messageId)}`
      );
    }

    // درخواست جریانی به همان مسیر فعلی دستیار.
    // مسیر عادی assistant همچنان باید JSON را حفظ کند.
    stage = "assistant_request";

    const assistantRequest = new Request(
      "https://internal/api/assistant",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
        question: text.trim(),
stream: true,
          
        }),
      }
    );

    const aiResponse = await assistantPost(
      assistantRequest
    );

    if (!aiResponse.ok) {
      const details = await aiResponse
        .text()
        .catch(() => "");

      console.error(
        "[BALE_WEBHOOK_ASSISTANT_ERROR]",
        {
          status: aiResponse.status,
          details: details.slice(0, 500),
        }
      );

      throw new Error(
        `Assistant request failed with status ${aiResponse.status}`
      );
    }

    // اگر مسیر دستیار هنوز JSON عادی برگرداند، آن را هم
    // می‌خوانیم تا تا زمان تکمیل مسیر Streaming رفتار قبلی
    // کاملاً از بین نرود.
    const contentType =
      aiResponse.headers.get("content-type") ?? "";

    let answer = "";
    let aiData: any = null;

    if (
      contentType.includes("application/json")
    ) {
      stage = "assistant_parse";

      aiData = await aiResponse.json();

      answer =
        aiData?.answer ??
        aiData?.response ??
        "";

      if (
        typeof answer !== "string" ||
        !answer.trim()
      ) {
        throw new Error(
          "پاسخ متنی معتبری از دستیار دریافت نشد."
        );
      }

      answer = answer.trim();
    } else {
      // ارسال پیام اولیه فقط پس از تأیید پاسخ جریانی.
      stage = "bale_send_initial_message";
      sendAttempted = true;

      const initialSend = await callBaleApi(
        token,
        "sendMessage",
        {
          chat_id: String(chatId),
          text: "در حال نوشتن پاسخ…",
          reply_to_message_id: numericMessageId,
        }
      );

      const initialData = initialSend.data;

      if (
        !initialSend.httpOk ||
        initialData?.ok !== true
      ) {
        console.error(
          "[BALE_INITIAL_SEND_ERROR]",
          {
            http_ok: initialSend.httpOk,
            description:
              initialData?.description ?? null,
          }
        );

        return NextResponse.json(
          {
            ok: false,
            stage,
            error: "ارسال پیام اولیه به بله ناموفق بود.",
            bale_description:
              initialData?.description ?? null,
          },
          { status: 502 }
        );
      }

      const initialMessageId =
        initialData?.result?.message_id ??
        initialData?.result?.message?.message_id ??
        initialData?.message?.message_id ??
        null;

      const parsedInitialMessageId =
        Number(initialMessageId);

      if (
        initialMessageId === null ||
        initialMessageId === undefined ||
        !Number.isSafeInteger(parsedInitialMessageId) ||
        parsedInitialMessageId <= 0
      ) {
        throw new Error(
          "شناسه پیام اولیه از بله دریافت نشد یا معتبر نیست."
        );
      }

      streamMessageId = parsedInitialMessageId;

      let displayedText = "";
      let lastDisplayedText = "در حال نوشتن پاسخ…";
      let lastDisplayedLength = 0;
      let lastEditAt = Date.now();
      let lastEditSucceeded = true;

      const editCurrentMessage = async (
        value: string
      ): Promise<boolean> => {
        const safeText = value
          .trim()
          .slice(0, BALE_MAX_MESSAGE_LENGTH);

        if (!safeText || safeText === lastDisplayedText) {
          return true;
        }

        const edit = await callBaleApi(
          token,
          "editMessageText",
          {
            chat_id: String(chatId),
            message_id: parsedInitialMessageId,
            text: safeText,
          }
        );

        if (
          !edit.httpOk ||
          edit.data?.ok !== true
        ) {
          console.error(
            "[BALE_EDIT_MESSAGE_ERROR]",
            {
              http_ok: edit.httpOk,
              description:
                edit.data?.description ?? null,
              message_id: parsedInitialMessageId,
            }
          );

          return false;
        }

        lastDisplayedText = safeText;
        lastDisplayedLength = safeText.length;
        lastEditAt = Date.now();

        return true;
      };

      stage = "assistant_stream_read";

      answer = await readAssistantStream(
        aiResponse,
        async (chunk) => {
          displayedText += chunk;

          const nextText = displayedText.slice(
            0,
            BALE_MAX_MESSAGE_LENGTH
          );

          const enoughNewText =
            nextText.length - lastDisplayedLength >=
            STREAM_EDIT_MIN_CHARS;

          const enoughTimePassed =
            Date.now() - lastEditAt >=
            STREAM_EDIT_INTERVAL_MS;

          if (
            nextText &&
            enoughNewText &&
            enoughTimePassed
          ) {
            try {
              lastEditSucceeded =
                await editCurrentMessage(nextText);
            } catch (error) {
              lastEditSucceeded = false;

              console.error(
                "[BALE_EDIT_MESSAGE_EXCEPTION]",
                error instanceof Error
                  ? error.message
                  : String(error)
              );
            }
          }
        }
      );

      
if (!answer) {
  console.error(
    "[BALE_EMPTY_ASSISTANT_STREAM]",
    JSON.stringify({
      status: aiResponse.status,
      content_type: contentType,
      body_used: aiResponse.bodyUsed,
      request_message_id: claimMessageId,
      answer_length: answer.length,
    })
  );

  throw new Error(
    "مدل پاسخ متنی تولید نکرد."
  );
}

      // ویرایش نهایی برای اطمینان از نمایش پاسخ کامل.
      stage = "bale_finalize_stream";

      let finalEditSucceeded = false;

      try {
        finalEditSucceeded = await editCurrentMessage(
          answer.slice(0, BALE_MAX_MESSAGE_LENGTH)
        );
      } catch (error) {
        console.error(
          "[BALE_FINAL_EDIT_EXCEPTION]",
          error instanceof Error
            ? error.message
            : String(error)
        );
      }

      let finalSentMessageId: string | number =
        parsedInitialMessageId;

      // در صورت شکست ویرایش، پاسخ کامل را جداگانه بفرست.
      if (!finalEditSucceeded) {
        stage = "bale_send_final_fallback";

        const fallbackSend = await callBaleApi(
          token,
          "sendMessage",
          {
            chat_id: String(chatId),
            text: answer.slice(
              0,
              BALE_MAX_MESSAGE_LENGTH
            ),
            reply_to_message_id: numericMessageId,
          }
        );

        const fallbackData = fallbackSend.data;

        if (
          !fallbackSend.httpOk ||
          fallbackData?.ok !== true
        ) {
          console.error(
            "[BALE_FINAL_FALLBACK_ERROR]",
            {
              http_ok: fallbackSend.httpOk,
              description:
                fallbackData?.description ?? null,
            }
          );

          // پیام اولیه هنوز موجود است؛ آن را به پیام خطا
          // تبدیل می‌کنیم تا در حالت شکست، متن انتظار باقی نماند.
          try {
            await callBaleApi(
              token,
              "editMessageText",
              {
                chat_id: String(chatId),
                message_id: parsedInitialMessageId,
                text:
                  "متأسفانه ارسال پاسخ کامل با خطا مواجه شد. لطفاً دوباره سؤال کنید.",
              }
            );
          } catch {
            // خطای ثانویه نباید خطای اصلی را بپوشاند.
          }

          return NextResponse.json(
            {
              ok: false,
              stage,
              error: "نمایش پاسخ نهایی در بله ناموفق بود.",
            },
            { status: 502 }
          );
        }

        const fallbackMessageId =
          fallbackData?.result?.message_id ??
          fallbackData?.result?.message?.message_id ??
          fallbackData?.message?.message_id ??
          null;

        if (
          fallbackMessageId !== null &&
          fallbackMessageId !== undefined
        ) {
          finalSentMessageId = fallbackMessageId;
        }
      }

      aiData = {
        ok: true,
        answer,
        ai_used: true,
        streaming: true,
        knowledge_match: null,
      };

      console.log(
        "[BALE_STREAM_SUCCESS]",
        JSON.stringify({
          chat_id: claimChatId,
          incoming_message_id: claimMessageId,
          initial_outgoing_message_id:
            parsedInitialMessageId,
          final_outgoing_message_id:
            String(finalSentMessageId),
          answer_length: answer.length,
          final_edit_succeeded: finalEditSucceeded,
          last_edit_succeeded: lastEditSucceeded,
        })
      );

      // ثبت پیام اولیه و در صورت وجود، پیام جایگزین.
      const outgoingIds = new Set<string>([
        String(parsedInitialMessageId),
        String(finalSentMessageId),
      ]);

      for (const outgoingId of outgoingIds) {
        stage = "register_outgoing_message";

        const {
          error: sentInsertError,
        } = await supabase
          .from("bale_sent_messages")
          .upsert(
            {
              chat_id: claimChatId,
              message_id: outgoingId,
            },
            {
              onConflict: "chat_id,message_id",
              ignoreDuplicates: true,
            }
          );

        if (sentInsertError) {
          console.error(
            "[BALE_SENT_MESSAGE_REGISTER_ERROR]",
            {
              message_id: outgoingId,
              code: sentInsertError.code ?? null,
              message: sentInsertError.message,
            }
          );
        }

        const {
          error: outgoingError,
        } = await supabase
          .from("bale_processed_messages")
          .upsert(
            {
              chat_id: claimChatId,
              message_id: outgoingId,
            },
            {
              onConflict: "chat_id,message_id",
              ignoreDuplicates: true,
            }
          );

        if (outgoingError) {
          console.error(
            "[BALE_OWN_MESSAGE_REGISTER_ERROR]",
            {
              message_id: outgoingId,
              code: outgoingError.code ?? null,
              message: outgoingError.message,
            }
          );
        }
      }

      console.log(
        "[BALE_WEBHOOK_SUCCESS]",
        JSON.stringify({
          update_id: payload?.update_id ?? null,
          saved_message_id: savedMessage?.id ?? null,
          incoming_message_id: claimMessageId,
          outgoing_message_id: String(finalSentMessageId),
          chat_id: claimChatId,
          sender_id: senderId ?? null,
          ai_used: aiData?.ai_used ?? true,
          knowledge_match:
            aiData?.knowledge_match ?? null,
        })
      );

      return NextResponse.json({
        ok: true,
        received: true,
        message_id: savedMessage?.id ?? null,
        sender:
          senderObject?.first_name ??
          senderObject?.name ??
          senderObject?.username ??
          null,
        chat_id: chatId,
        reply_to_message_id: messageId,
        answer: answer.trim(),
        ai_used: aiData?.ai_used ?? null,
        knowledge_match:
          aiData?.knowledge_match ?? null,
        streaming: contentType.includes("text/event-stream"),
        bale_ok: true,
      });
    }

    // مسیر سازگاری برای پاسخ JSON عادی:
    // همان رفتار ارسال قبلی را حفظ می‌کند.
    stage = "bale_send_message";
    sendAttempted = true;

    const sendPayload = {
      chat_id: String(chatId),
      text: answer.trim().slice(0, BALE_MAX_MESSAGE_LENGTH),
      reply_to_message_id: numericMessageId,
    };

    const baleResponse = await callBaleApi(
      token,
      "sendMessage",
      sendPayload
    );

    const baleData = baleResponse.data;

    console.log(
      "[BALE_REPLY_TARGET_DIAGNOSTIC]",
      JSON.stringify({
        incoming_message_id: claimMessageId,
        requested_reply_to_message_id: String(messageId),
        outgoing_message_id:
          baleData?.result?.message_id ??
          baleData?.result?.message?.message_id ??
          baleData?.message?.message_id ??
          null,
        api_ok: baleData?.ok ?? false,
        api_error_code: baleData?.error_code ?? null,
        api_description: baleData?.description ?? null,
        returned_reply_to_message_id:
          baleData?.result?.reply_to_message?.message_id ??
          baleData?.result?.reply_to_message?.id ??
          baleData?.result?.message?.reply_to_message?.message_id ??
          null,
      })
    );

    if (
      !baleResponse.httpOk ||
      baleData?.ok !== true
    ) {
      console.error(
        "[BALE_WEBHOOK_SEND_ERROR]",
        {
          status: baleResponse.httpOk,
          error_code: baleData?.error_code ?? null,
          description: baleData?.description ?? null,
          message_id: claimMessageId,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          stage,
          error: "ارسال پاسخ به بله ناموفق بود.",
          bale_description:
            baleData?.description ?? null,
        },
        { status: 502 }
      );
    }

    const sentMessageId =
      baleData?.result?.message_id ??
      baleData?.result?.message?.message_id ??
      baleData?.message?.message_id ??
      null;

    if (
      sentMessageId !== null &&
      sentMessageId !== undefined
    ) {
      stage = "register_outgoing_message";

      const outgoingId = String(sentMessageId);

      const {
        error: sentInsertError,
      } = await supabase
        .from("bale_sent_messages")
        .upsert(
          {
            chat_id: claimChatId,
            message_id: outgoingId,
          },
          {
            onConflict: "chat_id,message_id",
            ignoreDuplicates: true,
          }
        );

      if (sentInsertError) {
        console.error(
          "[BALE_SENT_MESSAGE_REGISTER_ERROR]",
          {
            message_id: outgoingId,
            code: sentInsertError.code ?? null,
            message: sentInsertError.message,
          }
        );
      }

      const {
        error: outgoingError,
      } = await supabase
        .from("bale_processed_messages")
        .upsert(
          {
            chat_id: claimChatId,
            message_id: outgoingId,
          },
          {
            onConflict: "chat_id,message_id",
            ignoreDuplicates: true,
          }
        );

      if (outgoingError) {
        console.error(
          "[BALE_OWN_MESSAGE_REGISTER_ERROR]",
          {
            message_id: outgoingId,
            code: outgoingError.code ?? null,
            message: outgoingError.message,
          }
        );
      }
    }

    console.log(
      "[BALE_WEBHOOK_SUCCESS]",
      JSON.stringify({
        update_id: payload?.update_id ?? null,
        saved_message_id: savedMessage?.id ?? null,
        incoming_message_id: claimMessageId,
        outgoing_message_id:
          sentMessageId == null
            ? null
            : String(sentMessageId),
        chat_id: claimChatId,
        sender_id: senderId ?? null,
        ai_used: aiData?.ai_used ?? null,
        knowledge_match: aiData?.knowledge_match ?? null,
      })
    );

    return NextResponse.json({
      ok: true,
      received: true,
      message_id: savedMessage?.id ?? null,
      sender:
        senderObject?.first_name ??
        senderObject?.name ??
        senderObject?.username ??
        null,
      chat_id: chatId,
      reply_to_message_id: messageId,
      answer: answer.trim(),
      ai_used: aiData?.ai_used ?? null,
      knowledge_match: aiData?.knowledge_match ?? null,
      bale_ok: true,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[BALE_WEBHOOK_ERROR]",
      {
        stage,
        error: errorMessage,
        chat_id: claimChatId || null,
        message_id: claimMessageId || null,
        send_attempted: sendAttempted,
      }
    );

    // اگر Streaming پس از ارسال پیام اولیه شکست خورد،
    // پیام را از حالت «در حال نوشتن» خارج کن.
    if (streamToken && streamMessageId !== null) {
      try {
        await callBaleApi(
          streamToken,
          "editMessageText",
          {
            chat_id: claimChatId,
            message_id: streamMessageId,
            text:
              "متأسفانه هنگام تولید پاسخ خطایی رخ داد. لطفاً دوباره سؤال کنید.",
          }
        );
      } catch (editError) {
        console.error(
          "[BALE_STREAM_ERROR_EDIT_FAILED]",
          editError instanceof Error
            ? editError.message
            : String(editError)
        );
      }
    }

    // اگر هنوز ارسال پاسخ شروع نشده، قفل‌ها را آزاد کن.
    if (!sendAttempted && supabase) {
      if (
        requestClaimCreated &&
        requestClaimKey
      ) {
        const {
          error: requestReleaseError,
        } = await supabase
          .from("bale_processed_requests")
          .delete()
          .eq("request_key", requestClaimKey);

        if (requestReleaseError) {
          console.error(
            "[BALE_REQUEST_RELEASE_ERROR]",
            requestReleaseError
          );
        }
      }

      if (
        claimCreated &&
        claimChatId &&
        claimMessageId
      ) {
        const { error: releaseError } =
          await supabase
            .from("bale_processed_messages")
            .delete()
            .eq("chat_id", claimChatId)
            .eq("message_id", claimMessageId);

        if (releaseError) {
          console.error(
            "[BALE_MESSAGE_RELEASE_ERROR]",
            releaseError
          );
        }
      }
    }

    return NextResponse.json(
      {
        ok: false,
        stage,
        error: "خطا در پردازش پیام",
      },
      { status: 500 }
    );
  }
}
