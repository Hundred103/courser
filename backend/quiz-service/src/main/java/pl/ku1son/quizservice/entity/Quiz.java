package pl.ku1son.quizservice.entity;
import jakarta.persistence.*;
import lombok.*;
import java.util.Set;
import java.util.HashSet;
import java.util.List;
import java.util.ArrayList;



@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "quizzes")
public class Quiz {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Builder.Default
    @OneToMany(mappedBy = "quiz", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    //private Set<Question> questions = new HashSet<>();
    @OrderColumn(name = "question_order")
    private List<Question> questions = new ArrayList<>();
    private String title;
    @Column(name = "owner_user_id")
    private Long ownerUserId;

    public void addQuestion(Question question) {
        questions.add(question);
        question.setQuiz(this);
    }

    public void removeQuestion(Question question) {
        questions.remove(question);
        question.setQuiz(null);
    }
}
