/*
 * БАЗА УПРАЖНЕНИЙ — MVP
 * Источники метрик:
 *  - MET-значения: 2024 Adult Compendium of Physical Activities (pacompendium.com) — свободно для коммерческого использования
 *  - Таксономия групп мышц / категорий и типовые диапазоны повторений: NSCA / ACE / ExRx (справочно)
 *  - secondsPerRep: модельный параметр (оценка, не цифра из источника)
 *
 * Формула калорий: kcal = MET * вес_кг * (повторения * подходы * secondsPerRep / 60) / 60
 *
 * typicalReps.max используется для защиты от завышения повторений при ручной сборке.
 */
export const EXERCISES = [
  // ================= ЛЕГИ (legs) =================
  { id: 'squat', name: 'Приседания', description: 'Классические приседания с собственным весом, ноги на ширине плеч, спина прямая.', muscleGroup: ['Квадрицепсы', 'Ягодицы', 'Бицепс бедра'], category: 'legs', metCode: '02052', metValue: 5.0, secondsPerRep: 3, typicalReps: { min: 8, max: 30 }, equipment: 'bodyweight', difficulty: 1 },
  { id: 'front_squat', name: 'Фронтальные приседания', description: 'Присед со штангой на груди, локти подняты, корпус максимально вертикален.', muscleGroup: ['Квадрицепсы', 'Ягодицы'], category: 'legs', metCode: '02052', metValue: 5.0, secondsPerRep: 3, typicalReps: { min: 6, max: 15 }, equipment: 'barbell', difficulty: 3 },
  { id: 'lunge', name: 'Выпады', description: 'Шаг вперёд, сгибая обе ноги до угла 90°, колено задней ноги почти касается пола.', muscleGroup: ['Квадрицепсы', 'Ягодицы', 'Бицепс бедра'], category: 'legs', metCode: '02056', metValue: 3.0, secondsPerRep: 4, typicalReps: { min: 8, max: 20 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'lateral_lunge', name: 'Боковые выпады', description: 'Шаг в сторону, сгибая опорную ногу, вторая нога остаётся прямой.', muscleGroup: ['Квадрицепсы', 'Приводящие', 'Ягодицы'], category: 'legs', metCode: '02056', metValue: 3.0, secondsPerRep: 4, typicalReps: { min: 8, max: 20 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'step_up', name: 'Зашагивания на платформу', description: 'Зашагивание на возвышение, полностью выпрямляя опорную ногу.', muscleGroup: ['Квадрицепсы', 'Ягодицы'], category: 'legs', metCode: '02056', metValue: 3.0, secondsPerRep: 3, typicalReps: { min: 8, max: 15 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'glute_bridge', name: 'Ягодичный мостик', description: 'Лёжа на спине, стопы на полу, подъём таза до прямой линии корпуса.', muscleGroup: ['Ягодицы', 'Бицепс бедра'], category: 'legs', metCode: '02024', metValue: 2.8, secondsPerRep: 3, typicalReps: { min: 10, max: 25 }, equipment: 'bodyweight', difficulty: 1 },
  { id: 'calf_raise', name: 'Подъёмы на носки', description: 'Встать на носки максимально высоко, пауза в верхней точке.', muscleGroup: ['Икроножные', 'Камбаловидная'], category: 'legs', metCode: '02024', metValue: 2.8, secondsPerRep: 3, typicalReps: { min: 12, max: 30 }, equipment: 'bodyweight', difficulty: 1 },
  { id: 'pistol_squat', name: 'Пистолетик (присед на одной ноге)', description: 'Присед на одной ноге, вторая вытянута вперёд.', muscleGroup: ['Квадрицепсы', 'Ягодицы'], category: 'legs', metCode: '02057', metValue: 6.5, secondsPerRep: 4, typicalReps: { min: 3, max: 10 }, equipment: 'bodyweight', difficulty: 4 },
  // ================= ЖИМ / ТОЛКАНИЕ (push) =================
  { id: 'push_up', name: 'Отжимания', description: 'Из упора лёжа, корпус прямой, опускание грудью к полу, отжимание.', muscleGroup: ['Грудные', 'Передняя дельта', 'Трицепс'], category: 'push', metCode: '02020', metValue: 7.5, secondsPerRep: 3, typicalReps: { min: 8, max: 30 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'incline_push_up', name: 'Отжимания от опоры', description: 'Отжимания с наклонным упором (от стола/стены), уменьшенная нагрузка.', muscleGroup: ['Грудные', 'Передняя дельта', 'Трицепс'], category: 'push', metCode: '02022', metValue: 3.8, secondsPerRep: 3, typicalReps: { min: 10, max: 30 }, equipment: 'bodyweight', difficulty: 1 },
  { id: 'dip', name: 'Отжимания на брусьях', description: 'Трицепс-дип между брусьями или на параллельных опорах.', muscleGroup: ['Трицепс', 'Грудные', 'Передняя дельта'], category: 'push', metCode: '02020', metValue: 7.5, secondsPerRep: 4, typicalReps: { min: 6, max: 15 }, equipment: 'bars', difficulty: 3 },
  { id: 'pike_push_up', name: 'Отжимания уголком (pike)', description: 'Таз вверх, корпус в пике, нагрузка на плечи.', muscleGroup: ['Дельты', 'Трицепс'], category: 'push', metCode: '02022', metValue: 3.8, secondsPerRep: 3, typicalReps: { min: 6, max: 15 }, equipment: 'bodyweight', difficulty: 3 },
  { id: 'shoulder_press', name: 'Жим над головой', description: 'Жим от плеч вверх, локти чуть впереди корпуса.', muscleGroup: ['Дельты', 'Трицепс', 'Верх трапеций'], category: 'push', metCode: '02052', metValue: 5.0, secondsPerRep: 3, typicalReps: { min: 6, max: 12 }, equipment: 'dumbbell', difficulty: 2 },
  { id: 'lateral_raise', name: 'Разведения гантелей в стороны', description: 'Подъём рук в стороны до уровня плеч, локти мягкие.', muscleGroup: ['Средняя дельта'], category: 'push', metCode: '02022', metValue: 3.8, secondsPerRep: 3, typicalReps: { min: 10, max: 15 }, equipment: 'dumbbell', difficulty: 2 },
  { id: 'bench_press', name: 'Жим лёжа', description: 'Жим штанги/гантелей от груди лёжа на спине.', muscleGroup: ['Грудные', 'Трицепс', 'Передняя дельта'], category: 'push', metCode: '02052', metValue: 5.0, secondsPerRep: 4, typicalReps: { min: 6, max: 12 }, equipment: 'barbell', difficulty: 3 },
  // ================= ТЯГА (pull) =================
  { id: 'pull_up', name: 'Подтягивания', description: 'Вис на перекладине, подтягивание до подбородка над перекладиной.', muscleGroup: ['Широчайшие', 'Бицепс', 'Большая круглая'], category: 'pull', metCode: '02020', metValue: 7.5, secondsPerRep: 4, typicalReps: { min: 3, max: 15 }, equipment: 'bar', difficulty: 4 },
  { id: 'chin_up', name: 'Подтягивания узким хватом', description: 'Хват ладонями к себе, больше акцент на бицепс.', muscleGroup: ['Широчайшие', 'Бицепс'], category: 'pull', metCode: '02020', metValue: 7.5, secondsPerRep: 4, typicalReps: { min: 3, max: 15 }, equipment: 'bar', difficulty: 4 },
  { id: 'bent_over_row', name: 'Тяга в наклоне', description: 'Наклон корпуса, тяга веса к поясу, лопатки вместе.', muscleGroup: ['Широчайшие', 'Ромбовидные', 'Задняя дельта', 'Бицепс'], category: 'pull', metCode: '02052', metValue: 5.0, secondsPerRep: 3, typicalReps: { min: 6, max: 15 }, equipment: 'dumbbell', difficulty: 2 },
  { id: 'inverted_row', name: 'Тяга обратным хватом (в упоре)', description: 'Подтягивание корпуса к перекладине снизу, ноги на полу.', muscleGroup: ['Широчайшие', 'Ромбовидные', 'Бицепс'], category: 'pull', metCode: '02022', metValue: 3.8, secondsPerRep: 3, typicalReps: { min: 8, max: 15 }, equipment: 'bar', difficulty: 2 },
  { id: 'face_pull', name: 'Тяга к лицу', description: 'Тяга каната/эспандера к лицу, локти вверх, сведение лопаток.', muscleGroup: ['Задняя дельта', 'Ротаторная манжета', 'Трапеции'], category: 'pull', metCode: '02022', metValue: 3.8, secondsPerRep: 3, typicalReps: { min: 12, max: 20 }, equipment: 'band', difficulty: 2 },
  { id: 'biceps_curl', name: 'Сгибание рук с гантелями', description: 'Подъём гантелей к плечам, локти прижаты к корпусу.', muscleGroup: ['Бицепс', 'Плечевая мышца'], category: 'pull', metCode: '02022', metValue: 3.8, secondsPerRep: 3, typicalReps: { min: 8, max: 15 }, equipment: 'dumbbell', difficulty: 1 },
  // ================= КОР (core) =================
  { id: 'plank', name: 'Планка', description: 'Упор на предплечьях, корпус в прямой линии, удержание.', muscleGroup: ['Поперечная мышца живота', 'Прямая мышца живота'], category: 'core', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 2, max: 10 }, equipment: 'bodyweight', difficulty: 1, isHold: true, holdSeconds: 30 },
  { id: 'side_plank', name: 'Боковая планка', description: 'Упор на одном предплечье, боком, корпус в линии.', muscleGroup: ['Косые мышцы', 'Квадратная мышца поясницы'], category: 'core', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 2, max: 8 }, equipment: 'bodyweight', difficulty: 2, isHold: true, holdSeconds: 25 },
  { id: 'crunch', name: 'Скручивания', description: 'Лёжа на спине, сгибание корпуса вверх к коленям.', muscleGroup: ['Прямая мышца живота'], category: 'core', metCode: '02024', metValue: 2.8, secondsPerRep: 2, typicalReps: { min: 15, max: 40 }, equipment: 'bodyweight', difficulty: 1 },
  { id: 'sit_up', name: 'Подъём корпуса', description: 'Полный подъём туловища до сидячего положения.', muscleGroup: ['Прямая мышца живота', 'Подвздошно-поясничная'], category: 'core', metCode: '02022', metValue: 3.8, secondsPerRep: 3, typicalReps: { min: 10, max: 25 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'russian_twist', name: 'Русский твист', description: 'Сидя, корпус отклонён назад, повороты корпуса в стороны.', muscleGroup: ['Косые мышцы'], category: 'core', metCode: '02022', metValue: 3.8, secondsPerRep: 2, typicalReps: { min: 15, max: 30 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'dead_bug', name: 'Мёртвый жук', description: 'Лёжа на спине, опускать противоположные руку и ногу к полу.', muscleGroup: ['Поперечная мышца живота', 'Прямая мышца живота'], category: 'core', metCode: '02024', metValue: 2.8, secondsPerRep: 3, typicalReps: { min: 8, max: 16 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'bird_dog', name: 'Птица-собака', description: 'На четвереньках, вытягивание противоположных руки и ноги.', muscleGroup: ['Поперечная мышца живота', 'Разгибатели спины', 'Ягодицы'], category: 'core', metCode: '02024', metValue: 2.8, secondsPerRep: 3, typicalReps: { min: 8, max: 16 }, equipment: 'bodyweight', difficulty: 2 },
  // ================= КАРДИО / ВСЁ ТЕЛО (cardio) =================
  { id: 'burpee', name: 'Берпи', description: 'Из упора — прыжок в присед и вверх, полный цикл.', muscleGroup: ['Всё тело'], category: 'cardio', metCode: '02032', metValue: 6.0, secondsPerRep: 4, typicalReps: { min: 6, max: 15 }, equipment: 'bodyweight', difficulty: 4 },
  { id: 'jumping_jack', name: 'Прыжки «ножницы»', description: 'Прыжок с разведением ног и рук в стороны и обратно.', muscleGroup: ['Всё тело', 'Икры'], category: 'cardio', metCode: '02020', metValue: 7.5, secondsPerRep: 1, typicalReps: { min: 20, max: 50 }, equipment: 'bodyweight', difficulty: 2 },
  { id: 'jump_squat', name: 'Прыжковые приседания', description: 'Присед с прыжком вверх, мягкое приземление.', muscleGroup: ['Квадрицепсы', 'Ягодицы'], category: 'cardio', metCode: '02057', metValue: 6.5, secondsPerRep: 3, typicalReps: { min: 8, max: 15 }, equipment: 'bodyweight', difficulty: 3 },
  { id: 'high_knees', name: 'Бег на месте с высоким подниманием бедра', description: 'Бег на месте, колени поднимаются выше пояса.', muscleGroup: ['Подвздошно-поясничная', 'Квадрицепсы'], category: 'cardio', metCode: '02032', metValue: 6.0, secondsPerRep: 1, typicalReps: { min: 30, max: 60 }, equipment: 'bodyweight', difficulty: 2, isTime: true, timeSeconds: 20 },
  { id: 'kettlebell_swing', name: 'Махи гирей', description: 'Маятниковый мах гири между ног до уровня груди.', muscleGroup: ['Ягодицы', 'Бицепс бедра', 'Задняя цепь'], category: 'cardio', metCode: '02058', metValue: 9.8, secondsPerRep: 3, typicalReps: { min: 10, max: 25 }, equipment: 'kettlebell', difficulty: 3 },
  { id: 'mountain_climber', name: 'Альпинист', description: 'В упоре лёжа, поочерёдное подтягивание коленей к груди.', muscleGroup: ['Кор', 'Подвздошно-поясничная', 'Плечи'], category: 'core', metCode: '02032', metValue: 6.0, secondsPerRep: 1, typicalReps: { min: 30, max: 60 }, equipment: 'bodyweight', difficulty: 3, isTime: true, timeSeconds: 20 },
  // ================= СТРЕТЧИНГ (stretch) =================
  { id: 'childs_pose', name: 'Поза ребёнка', description: 'Сидя на пятках, корпус и руки вытянуты вперёд, расслабление.', muscleGroup: ['Спина', 'Плечи'], category: 'stretch', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 1, max: 3 }, equipment: 'bodyweight', difficulty: 1, isHold: true, holdSeconds: 45 },
  { id: 'cat_cow', name: 'Кошка-корова', description: 'На четвереньках, прогиб и округление спины.', muscleGroup: ['Позвоночник', 'Спина'], category: 'stretch', metCode: '02024', metValue: 2.8, secondsPerRep: 4, typicalReps: { min: 8, max: 12 }, equipment: 'bodyweight', difficulty: 1 },
  { id: 'downward_dog', name: 'Собака мордой вниз', description: 'Из упора поднять таз, тело образует перевёрнутую V.', muscleGroup: ['Бицепс бедра', 'Икры', 'Плечи'], category: 'stretch', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 1, max: 3 }, equipment: 'bodyweight', difficulty: 1, isHold: true, holdSeconds: 30 },
  { id: 'forward_fold', name: 'Наклон вперёд стоя', description: 'Наклон корпуса к ногам, колени мягкие, руки к полу.', muscleGroup: ['Бицепс бедра', 'Поясница'], category: 'stretch', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 1, max: 3 }, equipment: 'bodyweight', difficulty: 1, isHold: true, holdSeconds: 30 },
  { id: 'quad_stretch', name: 'Растяжка квадрицепса', description: 'Стоя, стопа к ягодице, колено назад.', muscleGroup: ['Квадрицепсы'], category: 'stretch', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 1, max: 3 }, equipment: 'bodyweight', difficulty: 1, isHold: true, holdSeconds: 25 },
  { id: 'hip_flexor_stretch', name: 'Растяжка сгибателей бедра', description: 'Выпад, выталкивание таза вперёд, растяжка передней поверхности.', muscleGroup: ['Подвздошно-поясничная'], category: 'stretch', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 1, max: 3 }, equipment: 'bodyweight', difficulty: 1, isHold: true, holdSeconds: 25 },
  { id: 'shoulder_stretch', name: 'Растяжка плеч', description: 'Рука поперёк груди, лёгкое давление другой рукой.', muscleGroup: ['Плечи', 'Грудные'], category: 'stretch', metCode: '02024', metValue: 2.8, secondsPerRep: 1, typicalReps: { min: 1, max: 3 }, equipment: 'bodyweight', difficulty: 1, isHold: true, holdSeconds: 25 },
];

export const MUSCLE_GROUPS = ['Квадрицепсы', 'Ягодицы', 'Бицепс бедра', 'Грудные', 'Дельты', 'Трицепс', 'Широчайшие', 'Бицепс', 'Кор', 'Спина', 'Плечи', 'Икры', 'Всё тело'];

/** Стартовые категории каталога (сид). id совпадают с category-ключами в EXERCISES. */
export const CATEGORIES = [
  { id: 'legs', name: 'Ноги', order: 0 },
  { id: 'push', name: 'Жим/Толкание', order: 1 },
  { id: 'pull', name: 'Тяга', order: 2 },
  { id: 'core', name: 'Кор', order: 3 },
  { id: 'cardio', name: 'Кардио', order: 4 },
  { id: 'stretch', name: 'Стретчинг', order: 5 },
];

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id);
}

/**
 * Расчёт калорий за выполнение упражнения.
 * kcal = MET * вес_кг * (повторения * подходы * secondsPerRep / 60) / 60
 * Для удержаний (isHold / isTime) используется время напрямую.
 */
export function calcExerciseCalories(exercise, reps, sets, bodyWeightKg) {
  let activeSeconds;
  if (exercise.isHold) {
    activeSeconds = exercise.holdSeconds * (reps || 1);
  } else if (exercise.isTime) {
    activeSeconds = (exercise.timeSeconds || 20) * (reps || 1);
  } else {
    activeSeconds = (reps || 0) * (sets || 1) * exercise.secondsPerRep;
  }
  const minutes = activeSeconds / 60;
  const kcal = (exercise.metValue * 3.5 * bodyWeightKg / 200) * minutes;
  return Math.round(kcal * 10) / 10;
}

/** Проверка на завышение повторений относительно норматива упражнения. */
export function isRepsOverLimit(exercise, reps) {
  return reps > exercise.typicalReps.max;
}
