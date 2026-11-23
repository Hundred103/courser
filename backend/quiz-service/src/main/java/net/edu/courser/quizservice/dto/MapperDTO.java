package net.edu.courser.quizservice.dto;
import net.edu.courser.quizservice.entity.Answer;
import net.edu.courser.quizservice.entity.*;
import net.edu.courser.quizservice.service.MediaStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Base64;

@Component
@RequiredArgsConstructor
public class MapperDTO {
    private static final double MAX_SCORE_VALUE = 99.99d;
    /** quizzes.title is VARCHAR(255). */
    public static final int MAX_TITLE_LENGTH = 255;
    private static final String COPY_SUFFIX = " (kopia)";

    private final MediaStorageService mediaStorageService;

    public String validTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("Podaj tytuł quizu.");
        }
        if (title.length() > MAX_TITLE_LENGTH) {
            throw new IllegalArgumentException("Tytuł quizu może mieć najwyżej " + MAX_TITLE_LENGTH + " znaków.");
        }
        return title;
    }

    public String copyTitle(String title) {
        String base = title == null ? "" : title;
        return base.substring(0, Math.min(base.length(), MAX_TITLE_LENGTH - COPY_SUFFIX.length())) + COPY_SUFFIX;
    }

    public QuizRawDTO toQuizRawDTO(Quiz quiz, long questionCount, Integer rankingPosition) {
        return new QuizRawDTO(quiz.getId(), quiz.getTitle(), questionCount, toLimitsDto(quiz), rankingPosition);
    }

    public QuizPlayDTO toQuizPlayDTO(Quiz quiz) {
        return new QuizPlayDTO(
                quiz.getId(),
                quiz.getTitle(),
                quiz.getQuestions()
                        .stream()
                        .map(this::toQuestionPlayDTO)
                        .toList(),
                toScoringDto(quiz),
                toLimitsDto(quiz),
                quiz.getRankingVersion() != null,
                quiz.getRankingVersion() != null && quiz.getRankingVersion().isHasLoggedImport()
        );
    }
    private QuestionPlayDTO toQuestionPlayDTO(Question question) {
        return new QuestionPlayDTO(
                question.getId(),
                question.getContent(),
                question.getAnswers()
                        .stream()
                        .map(this::toAnswerPlayDTO)
                        .toList(),
                mediaStorageService.publicUrl(question.getImageKey())
        );
    }
    private AnswerPlayDTO toAnswerPlayDTO(Answer answer) {
        return new AnswerPlayDTO(
                answer.getId(),
                answer.getContent(),
                answer.isCorrect(),
                answer.getPoints()
        );
    }

    public QuizScoringDTO toScoringDto(Quiz quiz) {
        ScoringMode mode = quiz.getScoringMode() == null ? ScoringMode.DEFAULT : quiz.getScoringMode();
        PenaltyMode penaltyMode = quiz.getPenaltyMode() == null ? PenaltyMode.FRACTION : quiz.getPenaltyMode();

        return new QuizScoringDTO(
                mode.name().toLowerCase(),
                quiz.isAllowNegativeScore(),
                quiz.getPointsPerCorrect(),
                quiz.getIncorrectPenalty(),
                penaltyMode.name().toLowerCase()
        );
    }

    public void applyScoring(Quiz quiz, QuizScoringDTO scoring) {
        QuizScoringDTO normalized = normalizeScoring(scoring);
        quiz.setScoringMode(ScoringMode.valueOf(normalized.mode().toUpperCase()));
        quiz.setAllowNegativeScore(Boolean.TRUE.equals(normalized.allowNegativeScore()));
        quiz.setPointsPerCorrect(normalized.pointsPerCorrect());
        quiz.setIncorrectPenalty(normalized.incorrectPenalty());
        quiz.setPenaltyMode(PenaltyMode.valueOf(normalized.penaltyMode().toUpperCase()));
    }

    public Quiz toQuizEntity(QuizCreateDTO dto) {
        QuizScoringDTO scoring = normalizeScoring(dto.scoring());
        Quiz quiz = Quiz.builder()
                .title(validTitle(dto.title()))
                .scoringMode(ScoringMode.valueOf(scoring.mode().toUpperCase()))
                .allowNegativeScore(Boolean.TRUE.equals(scoring.allowNegativeScore()))
                .pointsPerCorrect(scoring.pointsPerCorrect())
                .incorrectPenalty(scoring.incorrectPenalty())
                .penaltyMode(PenaltyMode.valueOf(scoring.penaltyMode().toUpperCase()))
                .build();
        applyLimits(quiz, dto.limits());
        boolean customScoring = quiz.getScoringMode() == ScoringMode.CUSTOM;
        dto.questions().forEach(question -> quiz.addQuestion(toQuestionEntity(question, customScoring)));
        return quiz;
    }

    public QuizLimitsDTO toLimitsDto(Quiz quiz) {
        return new QuizLimitsDTO(
                quiz.isRandomQuestionOrder(),
                quiz.isShowCorrectAnswers()
        );
    }

    public void applyLimits(Quiz quiz, QuizLimitsDTO limits) {
        if (limits == null) {
            quiz.setRandomQuestionOrder(false);
            quiz.setShowCorrectAnswers(true);
            return;
        }

        quiz.setRandomQuestionOrder(Boolean.TRUE.equals(limits.randomQuestionOrder()));
        quiz.setShowCorrectAnswers(limits.showCorrectAnswers() == null || limits.showCorrectAnswers());
    }

    public Question toQuestionEntity(QuestionCreateDTO qDto, boolean customScoring) {
        Question question = Question.builder()
                .content(qDto.content())
                .imageKey(imageKey(qDto.image()))
                .build();
        qDto.answers().forEach(aDto -> {
            Answer answer = Answer.builder()
                    .content(aDto.content())
                    .correct(aDto.correct())
                    .points(normalizePoints(aDto.points(), customScoring, aDto.correct()))
                    .build();
            question.addAnswer(answer);
        });
        return question;
    }

    public QuizScoringDTO normalizeScoring(QuizScoringDTO scoring) {
        if (scoring == null) {
            return defaultScoring();
        }

        String mode = "custom".equalsIgnoreCase(scoring.mode()) ? "custom" : "default";
        String penaltyMode = switch (scoring.penaltyMode() == null ? "" : scoring.penaltyMode().trim().toLowerCase()) {
            case "points", "percent", "fraction" -> scoring.penaltyMode().trim().toLowerCase();
            default -> "fraction";
        };

        if ("fraction".equals(penaltyMode)) {
            return new QuizScoringDTO(
                    mode,
                    Boolean.TRUE.equals(scoring.allowNegativeScore()),
                    1d,
                    1d,
                    "fraction"
            );
        }

        return new QuizScoringDTO(
                mode,
                Boolean.TRUE.equals(scoring.allowNegativeScore()),
                boundedScore(scoring.pointsPerCorrect(), 1d, "Punkty za poprawną odpowiedź", 0d, MAX_SCORE_VALUE),
                boundedScore(scoring.incorrectPenalty(), 1d, "Kara za błędną odpowiedź", 0d, MAX_SCORE_VALUE),
                penaltyMode
        );
    }

    private QuizScoringDTO defaultScoring() {
        return new QuizScoringDTO("default", false, 1d, 1d, "fraction");
    }

    private double boundedScore(Double value, double fallback, String label, double min, double max) {
        if (value == null) {
            return fallback;
        }

        validateScore(value, label, min, max);
        return value;
    }

    private Double normalizePoints(Double points, boolean customScoring, boolean correct) {
        if (points == null) {
            return customScoring ? 0d : null;
        }

        validateScore(
                points,
                "Punkty przy odpowiedzi",
                correct ? 0d : -MAX_SCORE_VALUE,
                correct ? MAX_SCORE_VALUE : 0d
        );
        return points;
    }

    private void validateScore(Double value, String label, double min, double max) {
        if (!Double.isFinite(value)) {
            throw new IllegalArgumentException(label + " musi być liczbą skończoną.");
        }

        BigDecimal decimal = BigDecimal.valueOf(value).stripTrailingZeros();
        if (decimal.scale() > 2) {
            throw new IllegalArgumentException(label + " może mieć maksymalnie dwie cyfry po przecinku.");
        }

        if (value < min || value > max) {
            throw new IllegalArgumentException(
                    label + " musi mieścić się w zakresie " + formatScoreLimit(min) + "–" + formatScoreLimit(max) + "."
            );
        }
    }

    private String formatScoreLimit(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString().replace('.', ',');
    }

    /** /media/ path → key, or store data URL; used in ranking hash. */
    private String imageKey(String imageReference) {
        if (imageReference == null || imageReference.isBlank()) {
            return null;
        }

        String trimmed = imageReference.trim();
        if (!trimmed.startsWith("data:")) {
            if (!mediaStorageService.isMediaReference(trimmed)) {
                throw new IllegalArgumentException("Nie znaleziono pliku multimediów.");
            }
            return mediaStorageService.extractKey(trimmed);
        }

        int comma = trimmed.indexOf(',');
        if (comma < 0) {
            throw new IllegalArgumentException("Nieprawidłowe dane obrazu.");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(trimmed.substring(comma + 1));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Nieprawidłowe dane obrazu.", exception);
        }
        return mediaStorageService.store(bytes);
    }
}
