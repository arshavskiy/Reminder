import {createLocale, enUS} from 'naive-ui'
import {he} from 'date-fns/locale'

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
      startDatePlaceholder: 'תאריך תסקיר',
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
    Input: {
      placeholder: 'הזן ערך',
    },
    InputNumber: {
      placeholder: 'הזן מספר',
    },
    Cascader: {
      placeholder: 'בחר',
      loading: 'טוען',
      loadingRequiredMessage: (label: string) => `יש לטעון את כל הצאצאים של ${label} לפני בחירה.`,
    },
    TimePicker: {
      placeholder: 'בחר שעה',
      positiveText: 'אישור',
      negativeText: 'ביטול',
      now: 'עכשיו',
      clear: 'נקה',
    },
    Popconfirm: {
      positiveText: 'אישור',
      negativeText: 'ביטול',
    },
    DynamicInput: {
      create: 'הוסף',
    },
    DynamicTags: {
      add: 'הוסף',
    },
    Log: {
      loading: 'טוען',
    },
    Transfer: {
      selectAll: 'בחר הכל',
      unselectAll: 'בטל בחירת הכל',
      clearAll: 'נקה הכל',
      total: (num: number) => `סך הכל ${num} פריטים`,
      selected: (num: number) => `נבחרו ${num} פריטים`,
    },
  },
  enUS
)

export const dateHeIL = {
  name: 'he-IL',
  locale: he,
}
