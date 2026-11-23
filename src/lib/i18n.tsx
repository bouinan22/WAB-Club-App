import React, { createContext, useContext, useEffect, useState } from 'react';

export type AppLang = 'ar' | 'fr';

const LANG_KEY = 'wab_ui_lang';

const MESSAGES = {
  ar: {
    langName: 'العربية',
    switchLang: 'FR',
    switchTitle: 'التبديل إلى الفرنسية',
    seasonLabel: 'الموسم الرياضي',
    home: 'الرئيسية',
    clubOfficialPlatform: 'المنصة الرسمية لإدارة النادي، متابعة اللاعبين، وبرامج التكوين والتدريب.',
    registerInClub: 'التسجيل في النادي',
    registerSub: 'تحميل الاستمارة PDF وإرسال طلب الانضمام إلكترونياً',
    trackRequest: 'متابعة طلب التسجيل',
    trackSub: 'دخول المسجل لمتابعة حالة الطلب واستكمال الوثائق',
    memberPortals: 'بوابات الدخول للأعضاء:',
    adminPortal: 'فضاء إدارة النادي',
    adminBtn: 'الدخول إلى الإدارة',
    adminDesc: 'إدارة اللاعبين، طلبات التسجيل، المدربين، الأولياء، الاشتراكات، والمالية',
    coachPortal: 'فضاء المدربين',
    coachBtn: 'الدخول إلى فضاء المدربين',
    coachDesc: 'متابعة لاعبي الفئات المسندة، تسجيل الحضور، التدريبات، والتقييمات الفنية',
    parentPortal: 'فضاء الأولياء',
    parentBtn: 'الدخول إلى فضاء الأولياء',
    parentDesc: 'متابعة الأبناء، نسبة الحضور، التقييمات المعتمدة، ومواعيد التدريبات والمباريات',
    parentSimpleTab: 'دخول سريع بالابن',
    parentEmailTab: 'دخول بالبريد وكلمة المرور',
    childFullNameLabel: 'اسم الابن الكامل',
    childFullNamePlaceholder: 'أدخل الاسم واللقب كما هو مسجل في النادي',
    childBirthDateLabel: 'تاريخ ميلاد الابن',
    signInBtn: 'تسجيل الدخول',
    verifying: 'جاري التحقق...',
    emailOrUser: 'البريد الإلكتروني أو اسم المستخدم',
    passwordLabel: 'كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟',
    logout: 'تسجيل الخروج',
    notifications: 'الإشعارات',
    myAccount: 'حسابي',
    playersLabel: 'اللاعبون',
    attendanceLabel: 'الحضور',
    announcementsLabel: 'الإعلانات',
    adminQuickActions: 'الوصول السريع وروابط الفضاءات',
    manageParentsBtn: 'إدارة الأولياء',
    manageCoachesBtn: 'إدارة المدربين',
    copyAppShareBtn: 'نسخ رابط مشاركة التطبيق',
    copiedDone: 'تم النسخ',
    parentLinkTitle: 'رابط فضاء الأولياء',
    coachLinkTitle: 'رابط فضاء المدربين',
    copyLink: 'نسخ الرابط',
    shareWhatsapp: 'مشاركة عبر WhatsApp',
    coachLabel: 'المدرب',
    birthDateLabel: 'تاريخ الميلاد',
    categoryLabel: 'الفئة العمرية',
    attendanceRateLabel: 'الحضور والغياب',
    trainingsProgramLabel: 'برنامج التدريبات',
    matchesProgramLabel: 'برنامج المباريات',
    resultsAnnouncementsLabel: 'النتائج والإعلانات',
    readOnlyBadge: 'وضع المشاهدة فقط',
    sendReportToAdmin: 'إرسال تقرير للإدارة',
    coachReportsTitle: 'التقارير المرسلة للإدارة',
  },
  fr: {
    langName: 'Français',
    switchLang: 'العربية',
    switchTitle: "Passer à l'arabe",
    seasonLabel: 'Saison sportive',
    home: 'Accueil',
    clubOfficialPlatform: 'Plateforme officielle de gestion du club, suivi des joueurs et programmes sportifs.',
    registerInClub: 'Inscription au club',
    registerSub: 'Télécharger le formulaire PDF et soumettre la demande en ligne',
    trackRequest: "Suivi d'inscription",
    trackSub: "Suivre l'état de la demande et compléter les documents",
    memberPortals: 'Portails des membres :',
    adminPortal: 'Espace Administration',
    adminBtn: 'Accéder à Admin',
    adminDesc: 'Gestion des joueurs, inscriptions, entraîneurs, parents, cotisations et finances',
    coachPortal: 'Espace Entraîneurs',
    coachBtn: 'Accéder à Entraîneurs',
    coachDesc: 'Joueurs de la catégorie assignée, présences, entraînements et évaluations',
    parentPortal: 'Espace Parents',
    parentBtn: 'Accéder à Parents',
    parentDesc: 'Suivi des enfants, présence, évaluations, entraînements et matchs',
    parentSimpleTab: 'Accès par enfant',
    parentEmailTab: 'Connexion par e-mail',
    childFullNameLabel: "Nom complet de l'enfant",
    childFullNamePlaceholder: 'Nom et prénom enregistrés au club',
    childBirthDateLabel: "Date de naissance de l'enfant",
    signInBtn: 'Se connecter',
    verifying: 'Vérification...',
    emailOrUser: "E-mail ou nom d'utilisateur",
    passwordLabel: 'Mot de passe',
    forgotPassword: 'Mot de passe oublié ?',
    logout: 'Déconnexion',
    notifications: 'Notifications',
    myAccount: 'Mon compte',
    playersLabel: 'Joueurs',
    attendanceLabel: 'Présences',
    announcementsLabel: 'Annonces',
    adminQuickActions: 'Accès rapide & liens des portails',
    manageParentsBtn: 'Gestion des parents',
    manageCoachesBtn: 'Gestion des entraîneurs',
    copyAppShareBtn: "Copier le lien de partage",
    copiedDone: 'Lien copié',
    parentLinkTitle: 'Lien Espace Parents',
    coachLinkTitle: 'Lien Espace Entraîneurs',
    copyLink: 'Copier le lien',
    shareWhatsapp: 'Partager sur WhatsApp',
    coachLabel: 'Entraîneur',
    birthDateLabel: 'Date de naissance',
    categoryLabel: 'Catégorie',
    attendanceRateLabel: 'Présence',
    trainingsProgramLabel: "Programme d'entraînement",
    matchesProgramLabel: 'Calendrier des matchs',
    resultsAnnouncementsLabel: 'Résultats & annonces',
    readOnlyBadge: 'Mode lecture seule',
    sendReportToAdmin: 'Envoyer un rapport à la direction',
    coachReportsTitle: 'Rapports envoyés à la direction',
  },
} as const;

export type I18nMessages = (typeof MESSAGES)[AppLang];

interface LanguageContextValue {
  lang: AppLang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: AppLang) => void;
  toggleLang: () => void;
  t: (typeof MESSAGES)['ar'] | (typeof MESSAGES)['fr'];
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ar',
  dir: 'rtl',
  setLang: () => {},
  toggleLang: () => {},
  t: MESSAGES.ar,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLang>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved === 'fr' ? 'fr' : 'ar';
    } catch {
      return 'ar';
    }
  });

  const dir: 'rtl' | 'ltr' = lang === 'fr' ? 'ltr' : 'rtl';

  const setLang = (next: AppLang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  };

  const toggleLang = () => setLang(lang === 'ar' ? 'fr' : 'ar');

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  return (
    <LanguageContext.Provider value={{ lang, dir, setLang, toggleLang, t: MESSAGES[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => useContext(LanguageContext);

export const LanguageSwitcher: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { lang, setLang } = useLang();
  return (
    <div
      className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-100 p-0.5 shrink-0"
      role="group"
      aria-label="Language switcher"
    >
      <button
        type="button"
        onClick={() => setLang('ar')}
        className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap min-h-[34px] ${
          lang === 'ar' ? 'bg-[#14532D] text-white' : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        {compact ? 'ع' : 'العربية'}
      </button>
      <button
        type="button"
        onClick={() => setLang('fr')}
        className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap min-h-[34px] ${
          lang === 'fr' ? 'bg-[#14532D] text-white' : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        FR
      </button>
    </div>
  );
};
