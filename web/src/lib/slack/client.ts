interface SlackPostResult {
  ok: boolean;
  error?: string;
  ts?: string;
}

export async function postMessage(
  token: string,
  channel: string,
  text: string,
  blocks?: unknown[],
): Promise<SlackPostResult> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ channel, text, blocks, unfurl_links: false, unfurl_media: false }),
  });
  const json = (await res.json()) as SlackPostResult;
  return json;
}
