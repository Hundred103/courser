import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DailyStatistics, QuizScoreService } from '../../core/services/quiz-score.service';

type Period = 'today' | 'week' | 'month' | 'year' | 'all';
type Metric = 'questions' | 'quizzes' | 'effectiveness';
interface Bucket { label: string; quizzes: number; questions: number; sum: number; count: number; }

@Component({
  selector: 'app-home-page', standalone: true, imports: [RouterLink],
  templateUrl: './home-page.component.html', styleUrl: './home-page.component.css',
})
export class HomePageComponent {
  readonly auth = inject(AuthService);
  private readonly scores = inject(QuizScoreService);
  readonly period = signal<Period>('week');
  readonly metric = signal<Metric>('questions');
  readonly daily = signal<DailyStatistics[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly periods: { id: Period; label: string }[] = [
    { id: 'today', label: 'Dzisiaj' }, { id: 'week', label: '7 dni' },
    { id: 'month', label: '30 dni' }, { id: 'year', label: '12 miesięcy' },
    { id: 'all', label: 'Cały czas' },
  ];
  readonly metrics: { id: Metric; label: string }[] = [
    { id: 'questions', label: 'Pytania' }, { id: 'quizzes', label: 'Quizy' },
    { id: 'effectiveness', label: 'Skuteczność' },
  ];
  readonly buckets = computed(() => this.buildBuckets(this.daily(), this.period()));
  readonly totals = computed(() => this.buckets().reduce((total, b) => ({
    quizzes: total.quizzes + b.quizzes, questions: total.questions + b.questions,
    sum: total.sum + b.sum, count: total.count + b.count,
  }), { quizzes: 0, questions: 0, sum: 0, count: 0 }));
  readonly chartMax = computed(() => Math.max(1, ...this.buckets().map(b => Math.abs(this.value(b) ?? 0))));
  readonly hasNegative = computed(() => this.buckets().some(b => (this.value(b) ?? 0) < 0));

  constructor() {
    effect(() => {
      const user = this.auth.user();
      this.scores.scoresVersion();
      if (!user) { this.daily.set([]); return; }
      this.load();
    });
  }

  load(): void {
    this.loading.set(true); this.error.set(false);
    this.scores.getDailyStatistics().subscribe({
      next: data => { this.daily.set(data); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
  }
  value(bucket: Bucket): number | null {
    return this.metric() === 'questions' ? bucket.questions : this.metric() === 'quizzes' ? bucket.quizzes
      : bucket.count ? bucket.sum / bucket.count / 100 : null;
  }
  format(value: number | null): string {
    if (value === null) return '—';
    return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value);
  }
  barHeight(bucket: Bucket): number {
    return Math.abs(this.value(bucket) ?? 0) / this.chartMax() * (this.hasNegative() ? 48 : 92);
  }
  private buildBuckets(data: DailyStatistics[], period: Period): Bucket[] {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const today = dayKey(now);
    let start = new Date(now);
    if (period === 'week') start.setDate(start.getDate() - 6);
    if (period === 'month') start.setDate(start.getDate() - 29);
    if (period === 'year') {
      const day = start.getDate();
      start.setDate(1); start.setFullYear(start.getFullYear() - 1);
      const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      start.setDate(Math.min(day, lastDay) + 1);
    }
    if (period === 'all' && data.length) start = parse(data[0].date);
    const startKey = dayKey(start);
    const years = period === 'all' && (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() >= 24;
    const monthly = period === 'year' || (period === 'all' && !years && (now.getTime() - start.getTime()) / 86400000 > 45);
    const groupKey = (date: Date) => years ? String(date.getFullYear()) : monthly ? dayKey(date).slice(0, 7) : dayKey(date);
    const buckets = new Map<string, Bucket>();
    const cursor = new Date(start);
    while (cursor <= now) {
      const key = groupKey(cursor);
      if (!buckets.has(key)) {
        const label = years ? key : monthly ? new Intl.DateTimeFormat('pl-PL', { month: 'short', year: '2-digit' }).format(cursor)
          : new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(cursor);
        buckets.set(key, { label, quizzes: 0, questions: 0, sum: 0, count: 0 });
      }
      if (years) cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
      else if (monthly) cursor.setMonth(cursor.getMonth() + 1, 1);
      else cursor.setDate(cursor.getDate() + 1);
    }
    for (const row of data) {
      if (row.date < startKey || row.date > today) continue;
      const bucket = buckets.get(groupKey(parse(row.date)));
      if (bucket) { bucket.quizzes += row.completedQuizzes; bucket.questions += row.checkedQuestions; bucket.sum += row.effectivenessSum; bucket.count += row.effectivenessCount; }
    }
    return [...buckets.values()];
  }
}
