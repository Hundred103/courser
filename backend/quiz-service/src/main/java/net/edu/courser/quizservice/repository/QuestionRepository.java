package net.edu.courser.quizservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import net.edu.courser.quizservice.entity.Question;

import java.util.Collection;
import java.util.List;

@Repository
public interface QuestionRepository extends JpaRepository<Question, Long> {
    @Query("""
            select distinct question
            from Question question
            left join fetch question.answers
            where question.quiz.id = :quizId
            order by question.id
            """)
    List<Question> findWholeByQuizId(@Param("quizId") Long quizId);

    @Query("select distinct question.imageKey from Question question where question.imageKey is not null")
    List<String> findAllImageKeys();

    @Query("""
            select question.quiz.id as quizId, count(question) as questionCount
            from Question question
            where question.quiz.id in :quizIds
            group by question.quiz.id
            """)
    List<QuizQuestionCount> countByQuizIds(@Param("quizIds") Collection<Long> quizIds);

    interface QuizQuestionCount {
        Long getQuizId();
        long getQuestionCount();
    }
}
