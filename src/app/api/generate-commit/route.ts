import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_API_KEY is not configured.');
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    // 1. Parse request body
    const body = await request.json();
    const diff = body.diff;

    // 2. Validate input
    if (typeof diff !== 'string') {
      console.error('Invalid diff input received:', diff);
      return NextResponse.json({ error: 'Invalid diff input: diff must be a string' }, { status: 400 });
    }

    // Handle potentially empty diff - return a default message
    if (!diff.trim()) {
        console.log('Received empty diff, returning default message.');
        return NextResponse.json({ message: 'Update files' }); 
    }

    // 3. Initialize Google AI SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Use flash for speed/cost

    // 4. Construct Prompt
    const prompt = `Generate a concise, imperative Git commit message title (max 50 chars ideally) summarizing the following file changes based on the provided diff. Focus on *what* changed, not just the file names.\n\nDiff:\n\`\`\`diff\n${diff}\n\`\`\`\n\nCommit Message Title:`;

    // 5. Call Gemini API
    console.log("Sending prompt to Gemini...");
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log("Received raw commit message from Gemini:", text);

    // 6. Clean up response
    // Remove potential markdown, quotes, extra whitespace, etc.
    let cleanMessage = text.trim();
    // Remove leading/trailing backticks, quotes, asterisks
    cleanMessage = cleanMessage.replace(/^[`\"\'\*]+|[`\"\'\*]+$/g, '');
    // Remove potential prefixes like "Commit Message Title:" if the model includes them
    cleanMessage = cleanMessage.replace(/^Commit Message Title:\s*/i, '');
    // Ensure it's not empty after cleaning
    cleanMessage = cleanMessage || 'Update files'; // Fallback if cleaning results in empty string
    console.log("Cleaned commit message:", cleanMessage);

    // 7. Return success response
    return NextResponse.json({ message: cleanMessage });
  } catch (error) {
    // 8. Handle errors
    console.error("Error in /api/generate-commit:", error);
    let errorMessage = 'Failed to generate commit message';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    // Consider checking for specific API errors from Google AI if needed
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 