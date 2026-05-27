import { createLocale, enUS } from 'naive-ui'
import { he } from 'date-fns/locale'

export const heIL = createLocale(
  {
    name: 'he-IL',
    global: {
      undo: 'בטל',
      redo: 'בצע שוב',
      confirm: 'אישור',
      clear: 'נקה',
    },
    DatePicker: {
      yearFormat: 'yyyy',
      monthFormat: 'MMM',
      dayFormat: 'eeeeee',
      yearTypeFormat: 'yyyy',
      monthTypeFormat: 'yyyy/MM',
      clear: 'נקה',
      now: 'עכשיו',
      confirm: 'אישור',
      selectDate: 'בחר תאריך',
      selectTime: 'בחר שעה',
      datePlaceholder: 'בחר תאריך',
      datetimePlaceholder: 'בחר תאריך ושעה',
      monthPlaceholder: 'בחר חודש',
      yearPlaceholder: 'בחר שנה',
      startDatePlaceholder: 'תאריך התחלה',
      endDatePlaceholder: 'תאריך סיום',
      startDatetimePlaceholder: 'תאריך ושעת התחלה',
      endDatetimePlaceholder: 'תאריך ושעת סיום',
      startMonthPlaceholder: 'חודש התחלה',
      endMonthPlaceholder: 'חודש סיום',
      monthBeforeYear: false,
      firstDayOfWeek: 0 as 0,
    },
    DataTable: {
      checkTableAll: 'בחר הכל',
      uncheckTableAll: 'בטל בחירת הכל',
      confirm: 'אישור',
      clear: 'נקה',
    },
    Pagination: {
      goto: 'עבור לעמוד',
      selectionSuffix: 'בעמוד',
    },
    Select: {
      placeholder: 'בחר',
    },
    Empty: {
      description: 'אין נתונים',
    },
  },
  enUS
)

export const dateHeIL = {
  name: 'he-IL',
  locale: he,
}
