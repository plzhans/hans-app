hira 쪽은 데이터가 세분화 되어 있어서 추가 api 가 필요해

kr-hira/hosiptals/{ykiho}/시설정보 (원본 api 이름 : getEqpInfo2)
table : hira_hospital_facility
원본 api 응답 구조

```json
"item": {
    "addr": "경기도 수원시 팔달구 중부대로 93, (지동)",
    "aduChldSprmCnt": 73,
    "anvirTrrmSbdCnt": 6,
    "chldSprmCnt": 0,
    "clCd": "01",
    "clCdNm": "상급종합",
    "emdongNm": "지동",
    "emymCnt": 37,
    "estbDd": 19670523,
    "hghrSickbdCnt": 48,
    "hospUrl": "http://www.cmcvincent.or.kr/skip.html",
    "isnrSbdCnt": 6,
    "nbySprmCnt": 18,
    "orgTyCd": "04",
    "orgTyCdNm": "학교법인",
    "partumCnt": 2,
    "permSbdCnt": 760,
    "postNo": 16247,
    "psydeptClsGnlSbdCnt": 0,
    "psydeptClsHigSbdCnt": 0,
    "psydeptOpenGnlSbdCnt": 0,
    "psydeptOpenHigSbdCnt": 0,
    "ptrmCnt": 13,
    "sgguCd": 310603,
    "sgguCdNm": "수원팔달구",
    "sidoCd": 310000,
    "sidoCdNm": "경기",
    "soprmCnt": 20,
    "stdSickbdCnt": 609,
    "telno": "031-1577-8588",
    "yadmNm": "가톨릭대학교 성빈센트병원"
}
```

kr-hira/hosiptals/{ykiho}/전문과목정보 (원본 api 이름 : getSpcSbjtSdrInfo2)
table : hira_hospital_specialty
원본 api 응답 구조

```json
"item": [
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "01",
        "dgsbjtCdNm": "내과",
        "dgsbjtPrSdrCnt": 59
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "02",
        "dgsbjtCdNm": "신경과",
        "dgsbjtPrSdrCnt": 7
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "03",
        "dgsbjtCdNm": "정신건강의학과",
        "dgsbjtPrSdrCnt": 7
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "04",
        "dgsbjtCdNm": "외과",
        "dgsbjtPrSdrCnt": 19
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "05",
        "dgsbjtCdNm": "정형외과",
        "dgsbjtPrSdrCnt": 11
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "06",
        "dgsbjtCdNm": "신경외과",
        "dgsbjtPrSdrCnt": 9
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "07",
        "dgsbjtCdNm": "심장혈관흉부외과",
        "dgsbjtPrSdrCnt": 7
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "08",
        "dgsbjtCdNm": "성형외과",
        "dgsbjtPrSdrCnt": 4
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": "09",
        "dgsbjtCdNm": "마취통증의학과",
        "dgsbjtPrSdrCnt": 14
    },
    {
        "cdiagDrCnt": 0,
        "dgsbjtCd": 10,
        "dgsbjtCdNm": "산부인과",
        "dgsbjtPrSdrCnt": 9
    }
]
```

kr-hira/hosiptals/{ykiho}/진료과목정보 (원본 api 이름 : getDgsbjtInfo2)
table : hira_hospital_diagnosis_subject
원본 api 응답 구조

```json
"item": [
    {
        "dgsbjtCd": "01",
        "dgsbjtCdNm": "내과",
        "dtlSdrCnt": 59
    },
    {
        "dgsbjtCd": "02",
        "dgsbjtCdNm": "신경과",
        "dtlSdrCnt": 7
    },
    {
        "dgsbjtCd": "03",
        "dgsbjtCdNm": "정신건강의학과",
        "dtlSdrCnt": 7
    },
    {
        "dgsbjtCd": "04",
        "dgsbjtCdNm": "외과",
        "dtlSdrCnt": 19
    },
    {
        "dgsbjtCd": "05",
        "dgsbjtCdNm": "정형외과",
        "dtlSdrCnt": 11
    },
    {
        "dgsbjtCd": "06",
        "dgsbjtCdNm": "신경외과",
        "dtlSdrCnt": 9
    },
    {
        "dgsbjtCd": "07",
        "dgsbjtCdNm": "심장혈관흉부외과",
        "dtlSdrCnt": 7
    },
    {
        "dgsbjtCd": "08",
        "dgsbjtCdNm": "성형외과",
        "dtlSdrCnt": 4
    },
    {
        "dgsbjtCd": "09",
        "dgsbjtCdNm": "마취통증의학과",
        "dtlSdrCnt": 14
    },
    {
        "dgsbjtCd": 10,
        "dgsbjtCdNm": "산부인과",
        "dtlSdrCnt": 9
    }
]
```

kr-hira/codes 병원 코드 정보
table : hira_code
원본 api 응답 구조

```json
item": [
    {
        "oftCd": "A240",
        "oftCdNm": "분만감시기"
    },
    {
        "oftCd": "B101",
        "oftCdNm": "일반엑스선촬영장치"
    },
    {
        "oftCd": "B105",
        "oftCdNm": "유방촬영장치"
    },
    {
        "oftCd": "B108",
        "oftCdNm": "CT"
    },
    {
        "oftCd": "B109",
        "oftCdNm": "콘빔CT"
    },
    {
        "oftCd": "B201",
        "oftCdNm": "양전자단층촬영기 (PET)"
    },
    {
        "oftCd": "B203",
        "oftCdNm": "골밀도검사기"
    },
    {
        "oftCd": "B301",
        "oftCdNm": "MRI"
    },
    {
        "oftCd": "B302",
        "oftCdNm": "초음파영상진단기"
    },
    {
        "oftCd": "B403",
        "oftCdNm": "종양치료기 (Gamma Knife)"
    }
]
```

아래는 api 컨트롤러만 만들어 두고 미지원 표시
(추후) kr-hira/hosiptals/{ykiho}/특수진료정보 (원본 api 이름 : getSpclDiagInfo2)
(추후) kr-hira/hosiptals/{ykiho}/교통정보 (원본 api 이름 : getTrnsprtInfo2)
(추후) kr-hira/hosiptals/{ykiho}/의료장비정보 (원본 api 이름 : getMedOftInfo2)
(추후) kr-hira/hosiptals/{ykiho}/식대가산정보 (원본 api 이름 : getFoepAddcInfo2)
(추후) kr-hira/hosiptals/{ykiho}/간호등급정보 (원본 api 이름 : getNursigGrdInfo2)
(추후) kr-hira/hosiptals/{ykiho}/전문병원지정분야정보 (원본 api 이름 : getSpclHospAsgFldList2)
(추후) kr-hira/hosiptals/{ykiho}/기타인력정보 (원본 api 이름 : getEtcHstInfo2)
