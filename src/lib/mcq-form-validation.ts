export type McqFormChoice = {
  text: string;
  isCorrect: boolean;
};

export type McqFormFields = {
  name: string;
  question: string;
  choices: McqFormChoice[];
};

export function validateMcqForm(fields: McqFormFields): string | null {
  if (!fields.name.trim()) return "Name is required";
  if (!fields.question.trim()) return "Question is required";
  if (fields.choices.length < 2) return "An MCQ must have at least two choices";
  if (fields.choices.length > 6) return "An MCQ cannot have more than six choices";
  if (fields.choices.some((choice) => !choice.text.trim())) {
    return "Choice text is required";
  }
  const correctCount = fields.choices.filter((choice) => choice.isCorrect).length;
  if (correctCount !== 1) return "Exactly one choice must be correct";
  return null;
}
