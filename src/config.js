import "dotenv/config";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY가 .env 파일에 설정되지 않았습니다.");
}

export { OPENAI_API_KEY };
