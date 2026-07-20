import { useEffect } from "react";

export const SITE_NAME = "Talkietiv";
export const SITE_ORIGIN = "https://talkietiv.com";

export const HOME_META = {
  title: "Talkietiv: Free Online Walkie-Talkie & Voice Chat, No Account",
  description:
    "Create a private online walkie-talkie room in seconds. Use live push-to-talk voice, video, chat, screen sharing, and a whiteboard with no account required.",
  path: "/"
};

export const FAQ_ITEMS = [
  {
    question: "What is Talkietiv?",
    answer:
      "Talkietiv is a browser-based online walkie-talkie for live group voice chat. Create a room, share its link or code, and use push-to-talk without creating an account."
  },
  {
    question: "Can I use voice chat without creating an account?",
    answer:
      "Yes. Pick a temporary display name, create or join a room, and start talking. Talkietiv does not require a signup, email address, or app download to join a room."
  },
  {
    question: "How do I create a private online walkie-talkie room?",
    answer:
      "Enter an optional room name and select Create Room. Share the generated link or room code only with the people you want to invite. The room host can also lock the room and approve people individually."
  },
  {
    question: "Does Talkietiv work on phones and computers?",
    answer:
      "Yes. Talkietiv runs in a modern mobile or desktop browser. Allow microphone access when prompted, then hold the talk button or use the space bar on a computer."
  },
  {
    question: "Do I need to install a walkie-talkie app?",
    answer:
      "No. Talkietiv is an online walkie-talkie that works directly in your browser. Share a room link and participants can join from a compatible browser."
  },
  {
    question: "What can I do in a Talkietiv voice room?",
    answer:
      "Alongside push-to-talk voice chat, rooms support text messages, file sharing, video, screen sharing, per-person volume controls, a collaborative whiteboard, and temporary room history."
  },
  {
    question: "Are Talkietiv rooms searchable on Google?",
    answer:
      "No. Temporary room URLs are marked as private and excluded from search indexing. Only Talkietiv's public product and use-case pages are intended to appear in search results."
  },
  {
    question: "Is Talkietiv a replacement for an account-based voice chat app?",
    answer:
      "Talkietiv is designed for quick, link-based conversations when a full account-based workspace would slow people down. It is useful for friends, remote teams, study groups, events, and fast coordination."
  }
];

export const SEO_PAGES = {
  onlineWalkieTalkie: {
    path: "/online-walkie-talkie",
    title: "Online Walkie-Talkie in Your Browser | Talkietiv",
    description:
      "Use Talkietiv as a free online walkie-talkie in your browser. Create a private push-to-talk room, share a link, and talk live without an account.",
    eyebrow: "Online walkie-talkie",
    heading: "A free online walkie-talkie that starts in your browser",
    intro:
      "Talkietiv turns a shared room link into an instant push-to-talk channel. It is made for conversations that need to begin now: no download, no contact list, and no account setup before the first person can speak.",
    steps: [
      "Create a room with an optional name.",
      "Send the room link or code to your group.",
      "Allow microphone access and hold the talk button to speak."
    ],
    benefits: [
      ["No-account entry", "Invite people with a link or room code instead of a registration flow."],
      ["Push-to-talk control", "Keep group audio orderly with a familiar walkie-talkie interaction."],
      ["More than voice", "Use chat, video, screen sharing, files, and a shared whiteboard when the conversation needs context."]
    ],
    faq: FAQ_ITEMS.slice(0, 3)
  },
  voiceChatWithoutAccount: {
    path: "/voice-chat-without-account",
    title: "Voice Chat Without an Account | Talkietiv",
    description:
      "Start voice chat without an account, app download, or email. Talkietiv creates private browser rooms for live push-to-talk conversations and group coordination.",
    eyebrow: "Voice chat without an account",
    heading: "Voice chat without an account, download, or waiting room",
    intro:
      "For a quick conversation, an account can be needless friction. Talkietiv lets a group choose temporary names, join a private room from a browser, and start live voice chat as soon as everyone arrives.",
    steps: [
      "Choose the name you want people in this room to see.",
      "Create a room or enter an invite code.",
      "Talk live, send a message, or share your screen without installing software."
    ],
    benefits: [
      ["Fast for guests", "Bring together a client, classmate, or friend without asking them to make another account."],
      ["Private by link", "Share the room only with your group, then lock it and approve requests when you need more control."],
      ["Works across devices", "Open the same room on a modern phone or desktop browser." ]
    ],
    faq: [FAQ_ITEMS[1], FAQ_ITEMS[3], FAQ_ITEMS[6]]
  },
  browserVoiceChat: {
    path: "/browser-voice-chat",
    title: "Browser Voice Chat for Instant Rooms | Talkietiv",
    description:
      "Create an instant browser voice chat room with Talkietiv. Talk live with push-to-talk, use video or screen sharing, and invite people with one private link.",
    eyebrow: "Browser voice chat",
    heading: "Instant browser voice chat for the conversations that cannot wait",
    intro:
      "Talkietiv is browser voice chat built around a simple room. Send one link to your group, then use voice first and bring in video, screen sharing, messages, or a whiteboard only when useful.",
    steps: [
      "Open Talkietiv in a supported browser.",
      "Create a room and share the invite link.",
      "Use push-to-talk for live conversation, or turn on the tools your group needs."
    ],
    benefits: [
      ["Low-friction rooms", "A room code is enough to bring people together without scheduling a formal meeting."],
      ["Live collaboration", "Use screen sharing and a collaborative whiteboard beside the voice channel."],
      ["Participant controls", "See who is online, adjust individual volume, raise a hand, or lock a room as the host."]
    ],
    faq: [FAQ_ITEMS[0], FAQ_ITEMS[4], FAQ_ITEMS[5]]
  },
  groupVoiceChat: {
    path: "/group-voice-chat",
    title: "Free Group Voice Chat Rooms Online | Talkietiv",
    description:
      "Create a free group voice chat room online with Talkietiv. Share a room code for live push-to-talk, text chat, video, screen sharing, and whiteboard collaboration.",
    eyebrow: "Group voice chat",
    heading: "Free group voice chat rooms for quick coordination",
    intro:
      "A Talkietiv room gives a group one place to speak, type, and collaborate. It is a practical choice for remote teams, study groups, friends, volunteer crews, and anyone who needs a simple live voice channel.",
    steps: [
      "Name the room so your group can recognize it.",
      "Share the invite link in the channel your group already uses.",
      "Use voice, messages, video, and collaboration tools in the same room."
    ],
    benefits: [
      ["Built for groups", "Participant presence and speaking indicators make it easy to follow an active room."],
      ["One shared space", "Chat messages, attachments, whiteboard work, and voice stay connected to the same temporary room."],
      ["Host controls", "Lock the room and decide who can enter when the conversation needs to stay private."]
    ],
    faq: [FAQ_ITEMS[2], FAQ_ITEMS[5], FAQ_ITEMS[7]]
  }
};

function absoluteUrl(path) {
  return `${SITE_ORIGIN}${path === "/" ? "/" : path.replace(/\/$/, "")}`;
}

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
}

export function usePageMeta({ title, description, path = "/", index = true }) {
  useEffect(() => {
    const canonicalUrl = absoluteUrl(path);
    document.title = title;

    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: index ? "index,follow,max-image-preview:large" : "noindex,nofollow,noarchive"
    });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonicalUrl });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);
  }, [description, index, path, title]);
}
