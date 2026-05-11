/**
 * Avatar URL normalization across the chat / handshake / transaction /
 * forum endpoints. The mobile client can't load relative `/media/...` paths
 * directly — these tests pin the shape API responses come out of each
 * endpoint in so any future regression that drops normalization fails fast.
 */

import { listChats, getChat, createChat } from "../chats";
import { listHandshakes, getHandshake } from "../handshakes";
import { listTransactions, getTransaction } from "../transactions";
import {
  listTopics,
  getTopic,
  createTopic,
  patchTopic,
  listTopicPosts,
  createTopicPost,
  patchPost,
  listRecentPosts,
  getMyActivity,
  lockTopic,
  pinTopic,
} from "../forum";
import { mockFetchResolve } from "./helpers";

const API_HOST = "https://apiary.selmangunes.com";

describe("avatar URL normalization", () => {
  beforeEach(() => {
    (global as unknown as { fetch: unknown }).fetch = jest.fn();
  });

  describe("chats", () => {
    it("rewrites relative other_user.avatar_url and last_message.sender_avatar_url on listChats", async () => {
      mockFetchResolve([
        {
          handshake_id: "h1",
          other_user: { id: "u1", name: "A", avatar_url: "/media/a.jpg" },
          last_message: {
            id: "m1",
            sender_avatar_url: "/media/b.jpg",
          },
        },
      ]);
      const [chat] = await listChats();
      expect(chat.other_user.avatar_url).toBe(`${API_HOST}/media/a.jpg`);
      expect(chat.last_message.sender_avatar_url).toBe(`${API_HOST}/media/b.jpg`);
    });

    it("rewrites avatars on getChat", async () => {
      mockFetchResolve({
        handshake_id: "h1",
        other_user: { id: "u1", name: "A", avatar_url: "/media/a.jpg" },
      });
      const chat = await getChat("h1");
      expect(chat.other_user.avatar_url).toBe(`${API_HOST}/media/a.jpg`);
    });

    it("rewrites avatars on createChat", async () => {
      mockFetchResolve({
        handshake_id: "h1",
        other_user: { id: "u1", name: "A", avatar_url: "/media/a.jpg" },
      });
      const chat = await createChat();
      expect(chat.other_user.avatar_url).toBe(`${API_HOST}/media/a.jpg`);
    });

    it("preserves already-absolute avatar URLs verbatim", async () => {
      const absolute = "https://cdn.example.com/me.jpg";
      mockFetchResolve([
        {
          handshake_id: "h1",
          other_user: { id: "u1", name: "A", avatar_url: absolute },
        },
      ]);
      const [chat] = await listChats();
      expect(chat.other_user.avatar_url).toBe(absolute);
    });

    it("does not invent other_user when the API did not send it", async () => {
      mockFetchResolve({ handshake_id: "h1" });
      const chat = await getChat("h1");
      expect(chat).not.toHaveProperty("other_user");
    });
  });

  describe("handshakes", () => {
    it("rewrites counterpart.avatar_url on listHandshakes", async () => {
      mockFetchResolve({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "h1",
            service: "s1",
            status: "accepted",
            created_at: "2026-04-01T00:00:00Z",
            counterpart: {
              id: "u1",
              first_name: "A",
              last_name: "B",
              email: "a@b.com",
              avatar_url: "/media/x.jpg",
            },
          },
        ],
      });
      const res = await listHandshakes();
      expect(res.results[0].counterpart?.avatar_url).toBe(
        `${API_HOST}/media/x.jpg`,
      );
    });

    it("leaves handshakes without counterpart untouched", async () => {
      mockFetchResolve({
        id: "h2",
        service: "s2",
        status: "pending",
        created_at: "2026-04-01T00:00:00Z",
      });
      const h = await getHandshake("h2");
      expect(h.counterpart).toBeUndefined();
    });
  });

  describe("transactions", () => {
    it("rewrites counterpart.avatar_url on listTransactions", async () => {
      mockFetchResolve({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "t1",
            transaction_type: "transfer",
            amount: 1,
            counterpart: {
              id: "u1",
              first_name: "A",
              last_name: "B",
              email: "a@b.com",
              avatar_url: "/media/c.jpg",
            },
          },
        ],
      });
      const res = await listTransactions();
      expect(res.results[0].counterpart?.avatar_url).toBe(
        `${API_HOST}/media/c.jpg`,
      );
    });

    it("rewrites counterpart.avatar_url on getTransaction", async () => {
      mockFetchResolve({
        id: "t1",
        transaction_type: "transfer",
        amount: 1,
        counterpart: {
          id: "u1",
          first_name: "A",
          last_name: "B",
          email: "a@b.com",
          avatar_url: "/media/c.jpg",
        },
      });
      const tx = await getTransaction("t1");
      expect(tx.counterpart?.avatar_url).toBe(`${API_HOST}/media/c.jpg`);
    });
  });

  describe("forum", () => {
    const baseTopic = {
      id: "t1",
      category: "c1",
      category_name: "General",
      category_slug: "general",
      author_id: "u1",
      author_name: "A",
      author_avatar_url: "/media/topic.jpg",
      title: "Hello",
      body: "Hi",
      is_pinned: false,
      is_locked: false,
      view_count: 0,
      reply_count: 0,
      last_activity: "2026-04-01T00:00:00Z",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    };

    const basePost = {
      id: "p1",
      topic: "t1",
      author_id: "u1",
      author_name: "A",
      author_avatar_url: "/media/post.jpg",
      body: "reply",
      is_deleted: false,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    };

    it("rewrites author_avatar_url on listTopics, getTopic, createTopic, patchTopic, lockTopic, pinTopic", async () => {
      mockFetchResolve({ count: 1, next: null, previous: null, results: [baseTopic] });
      let topics = await listTopics();
      expect(topics.results[0].author_avatar_url).toBe(`${API_HOST}/media/topic.jpg`);

      mockFetchResolve(baseTopic);
      let topic = await getTopic("t1");
      expect(topic.author_avatar_url).toBe(`${API_HOST}/media/topic.jpg`);

      mockFetchResolve(baseTopic);
      topic = await createTopic({ title: "Hello", category: "c1", body: "Hi" });
      expect(topic.author_avatar_url).toBe(`${API_HOST}/media/topic.jpg`);

      mockFetchResolve(baseTopic);
      topic = await patchTopic("t1", { title: "x" });
      expect(topic.author_avatar_url).toBe(`${API_HOST}/media/topic.jpg`);

      mockFetchResolve(baseTopic);
      topic = await lockTopic("t1");
      expect(topic.author_avatar_url).toBe(`${API_HOST}/media/topic.jpg`);

      mockFetchResolve(baseTopic);
      topic = await pinTopic("t1");
      expect(topic.author_avatar_url).toBe(`${API_HOST}/media/topic.jpg`);
    });

    it("rewrites open_topic_items avatars on getMyActivity", async () => {
      mockFetchResolve({
        my_topics: 1,
        my_replies: 1,
        open_topics: 1,
        open_topic_items: [baseTopic],
      });
      const activity = await getMyActivity();
      expect(activity.open_topic_items[0].author_avatar_url).toBe(
        `${API_HOST}/media/topic.jpg`,
      );
    });

    it("rewrites author_avatar_url on listTopicPosts, createTopicPost, patchPost, listRecentPosts", async () => {
      mockFetchResolve({ count: 1, next: null, previous: null, results: [basePost] });
      const posts = await listTopicPosts("t1");
      expect(posts.results[0].author_avatar_url).toBe(`${API_HOST}/media/post.jpg`);

      mockFetchResolve(basePost);
      let p = await createTopicPost("t1", { body: "reply" });
      expect(p.author_avatar_url).toBe(`${API_HOST}/media/post.jpg`);

      mockFetchResolve(basePost);
      p = await patchPost("p1", { body: "edit" });
      expect(p.author_avatar_url).toBe(`${API_HOST}/media/post.jpg`);

      mockFetchResolve([basePost]);
      const recent = await listRecentPosts();
      expect(recent[0].author_avatar_url).toBe(`${API_HOST}/media/post.jpg`);
    });
  });
});
