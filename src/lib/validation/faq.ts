import { z } from "zod";

const QUESTION = "Вопрос: от 3 до 300 символов";
const ANSWER = "Ответ: от 1 до 5000 символов";

export const faqSchema = z.object({
  question: z.string({ error: QUESTION }).trim().min(3, QUESTION).max(300, QUESTION),
  answer: z.string({ error: ANSWER }).trim().min(1, ANSWER).max(5000, ANSWER),
});
