import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DailyChallengeQuestion, DEFAULT_REWARD_PER_CORRECT } from "@/config/DailyChallenge";

// See app/api/daily-challenge/route.ts for why these are created lazily
// inside the handler rather than at module load time.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
function getPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

async function getRewardPerCorrect(): Promise<number> {
  try {
    const { data } = await getPublicClient().from("app_settings").select("value").eq("key", "daily_challenge_reward_per_correct").maybeSingle();
    return typeof data?.value === "number" ? data.value : DEFAULT_REWARD_PER_CORRECT;
  } catch {
    return DEFAULT_REWARD_PER_CORRECT;
  }
}

export async function POST(req: Request) {
  try {
    const { challengeDate, answers } = await req.json();
    if (typeof challengeDate !== "string" || !Array.isArray(answers)) {
      return NextResponse.json({ error: "Malformed submission." }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();
    const { data: challenge } = await supabaseAdmin
      .from("daily_challenges")
      .select("id, questions")
      .eq("challenge_date", challengeDate)
      .maybeSingle();

    if (!challenge) {
      return NextResponse.json({ error: "No challenge found for that date." }, { status: 404 });
    }

    const questions = challenge.questions as DailyChallengeQuestion[];
    if (answers.length !== questions.length) {
      return NextResponse.json({ error: "Answer count doesn't match the question count." }, { status: 400 });
    }

    // Identify the caller from their Supabase access token, if they sent
    // one — logged-in users get real server-enforced once-per-day locking;
    // a guest (no token) is graded the same way but not locked or logged
    // server-side, same trust level as every other guest feature in this
    // app (client-side localStorage is the enforcement there instead).
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      userId = userData?.user?.id ?? null;
    }

    if (userId) {
      const { data: existingAttempt } = await supabaseAdmin
        .from("daily_challenge_attempts")
        .select("id")
        .eq("user_id", userId)
        .eq("challenge_date", challengeDate)
        .maybeSingle();
      if (existingAttempt) {
        return NextResponse.json({ error: "Already completed today's challenge." }, { status: 409 });
      }
    }

    const results = questions.map((q, i) => ({ correct: answers[i] === q.correctIndex, correctIndex: q.correctIndex }));
    const correctCount = results.filter((r) => r.correct).length;
    const rewardPerCorrect = await getRewardPerCorrect();
    const score = correctCount * rewardPerCorrect;

    // Full per-question detail for the Daily Challenge history tab —
    // question/options are snapshotted here (not just referenced by date)
    // so history stays accurate even if that date's question set is ever
    // edited or removed later.
    const answerDetail = questions.map((q, i) => ({
      question: q.text,
      options: q.options,
      chosen_index: answers[i] ?? null,
      correct_index: q.correctIndex,
      is_correct: answers[i] === q.correctIndex,
    }));

    if (userId) {
      const { error: insertError } = await supabaseAdmin.from("daily_challenge_attempts").insert({
        user_id: userId,
        challenge_date: challengeDate,
        score,
        correct_count: correctCount,
        total_questions: questions.length,
        answers: answerDetail,
      });
      // A unique-violation here means a second, near-simultaneous submit
      // from the same user lost a race with this one — treat it exactly
      // like the up-front check catching it, not a hard error.
      if (insertError && insertError.code === "23505") {
        return NextResponse.json({ error: "Already completed today's challenge." }, { status: 409 });
      }
      if (insertError) {
        console.error(insertError);
        return NextResponse.json({ error: "Failed to record your attempt." }, { status: 500 });
      }
    }

    return NextResponse.json({ correctCount, totalQuestions: questions.length, score, rewardPerCorrect, results, answers: answerDetail });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
