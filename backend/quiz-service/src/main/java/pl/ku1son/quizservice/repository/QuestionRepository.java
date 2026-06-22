package pl.ku1son.quizservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import pl.ku1son.quizservice.entity.Question;

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
}
