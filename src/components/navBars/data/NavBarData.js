import { icons } from "../../../assets/icons/icons";

export const NavBarData = {
    NavBarLinks: [[
        {
            buttonText: "לכל התיקים",
            buttonScreen: "",
            icon: icons.NavBarIcons.Hammer,
            onClick: () => { }
        },
        {
            buttonText: "תיק חדש",
            buttonScreen: "",
            icon: icons.NavBarIcons.NewCase,
            onClick: () => { }

        },
        {
            buttonText: "עדכון תיק",
            buttonScreen: "",
            icon: icons.NavBarIcons.UpdateCase,
            onClick: () => { }
        }
    ],
    [
        {
            buttonText: "הוספת מנהל",
            buttonScreen: "",
            icon: icons.NavBarIcons.Manager,
            onClick: () => { }
        },
        {
            buttonText: "לכל המנהלים",
            buttonScreen: "",
            icon: icons.NavBarIcons.AllManagers,
            onClick: () => { }
        },
    ],
    [
        {
            buttonText: "הוספת סוג תיק",
            buttonScreen: "",
            icon: icons.NavBarIcons.AddCaseType,
            onClick: () => { }
        },
        {
            buttonText: "לכל סוגי התיקים",
            buttonScreen: "",
            icon: icons.NavBarIcons.AllCasesType,
            onClick: () => { }
        },
    ]
    ]
}