const DEFAULTS = {
    client: {
        emailSubject: 'תזכורת לעדכון רישיון – נותרו [[time_left]]',
        emailBody:
            'שלום [[recipient_name]],<br><br>' +
            'נשמח שתעדכן את הרישיון שלך עד <strong>[[expiry_date]]</strong>. נותרו <strong>[[time_left]]</strong>.' +
            '<br><br>תיק: <strong>[[case_title]]</strong>' +
            '<br><br><a href="[[action_url]]" target="_blank" rel="noopener noreferrer">לכניסה למערכת</a>',
        pushTitle: 'תזכורת לעדכון רישיון',
        pushBody: 'נשמח שתעדכן את הרישיון שלך עד [[expiry_date]]. נותרו [[time_left]].',
    },
    manager: {
        emailSubject: 'תזכורת: ללקוח [[client_name]] עומד לפוג הרישיון בעוד שבועיים',
        emailBody:
            'שלום [[recipient_name]],<br><br>' +
            'ללקוח <strong>[[client_name]]</strong> עומד לפוג הרישיון בתאריך <strong>[[expiry_date]]</strong>.' +
            '<br><br>תיק: <strong>[[case_title]]</strong>' +
            '<br><br><a href="[[action_url]]" target="_blank" rel="noopener noreferrer">לכניסה למערכת</a>',
    },
};

module.exports = { DEFAULTS };
