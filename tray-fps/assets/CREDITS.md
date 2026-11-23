# 에셋 출처

모든 실사 에셋은 [Poly Haven](https://polyhaven.com) 의 **CC0(퍼블릭 도메인)** 자료입니다. 출처 표기 의무는 없지만 감사의 뜻으로 남깁니다.
원본(1K)을 내려받은 뒤 휴대폰용으로 최적화했습니다: JPG 재압축(알베도/ARM 품질 80, 노멀 90), meshoptimizer 로 폴리곤 감소, GLB 단일 파일로 패킹.

| 종류 | 이름 | 사용처 | 최적화 |
|---|---|---|---|
| 모델 | concrete_road_barrier | 저지 방호벽, 부두 방호선 | 60,928 → 4,262 폴리곤 |
| 모델 | Barrel_01 (explosive) | 폭발 드럼통 | 원본 유지 |
| 모델 | barrel_03 | 일반 드럼통 | 원본 유지 |
| 모델 | propane_tank | 폭발 프로판 탱크 | 5,238 → 3,142 |
| 모델 | street_lamp_01 | 가로등(1.6배 확대) | 30,610 → 6,906 |
| 모델 | wooden_military_crate | 군용 상자 더미 | 22,986 → 5,745 |
| 모델 | ammo_box | 탄약 보급 픽업 | 4,382 → 2,632 |
| 모델 | medical_box | 구급상자 픽업 | 3,718 → 2,600 |
| 모델 | cement_bag | 엄폐용 포대 벽 | 원본 유지 |
| 모델 | old_tyre | 폐타이어 더미 | 원본 유지 |
| 텍스처 | asphalt_02 | 지면 | — |
| 텍스처 | concrete_wall_006 | 외곽 담장 | — |
| 텍스처 | concrete_slab_wall | 사무동 | — |
| 텍스처 | container_side | 컨테이너(색상 변형 5종 런타임 생성) | — |
| 텍스처 | corrugated_iron_02 | 창고 외벽 | — |
| HDRI | furry_clouds (4K 사진 + 1K 조명) | 낮 맵 하늘 배경·환경광 | — |
| 텍스처 | white_stucco · beige_wall_001 · plastered_stone_wall · clay_roof_tiles · cobblestone_floor_001 · blue_painted_planks | 지중해 마을 | — |
| HDRI | rooftop_night (1K) | 환경 반사광(최대 밝기 제한 후 사용) | — |

합계 약 9.7MB. 로드에 실패한 항목은 코드로 만든 절차적 대체물이 자동으로 쓰입니다.

## 실사 캐릭터·총기 (Sketchfab, CC BY 4.0 — 저작자 표시 필수)

| 모델 | 제작자 | 출처 | 사용처 |
|---|---|---|---|
| S.W.A.T. Operator - Remastered | jeandiz | https://sketchfab.com/3d-models/732d2eec5a0c456bafedd08af35134c3 | 공격팀(알파) 대원 |
| FSB Operator | jeandiz | https://sketchfab.com/3d-models/43a561e941704eefb1ab0614be4f0049 | 수비팀(브라보) 대원 |
| M16 Assault Rifle | jeandiz | https://sketchfab.com/3d-models/339d0f7b21024387853dd926a5d51b50 | 1인칭 소총 |

라이선스: https://creativecommons.org/licenses/by/4.0/
변경 사항: 형상은 meshopt 무손실 압축(폴리곤·좌표 원본 유지), 텍스처는 해상도 유지한 WebP(품질 92~95) 변환, 게임용 판정 박스·팀 완장 추가.
