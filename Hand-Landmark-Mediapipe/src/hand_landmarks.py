import argparse
import time

import cv2
import mediapipe as mp


def parse_args():
    parser = argparse.ArgumentParser(description="Real-time hand landmark detection.")
    parser.add_argument("--camera", type=int, default=0, help="Camera index to open.")
    parser.add_argument("--max-hands", type=int, default=2, help="Maximum hands to detect.")
    parser.add_argument(
        "--min-detection-confidence",
        type=float,
        default=0.6,
        help="Minimum confidence for initial hand detection.",
    )
    parser.add_argument(
        "--min-tracking-confidence",
        type=float,
        default=0.6,
        help="Minimum confidence for landmark tracking.",
    )
    return parser.parse_args()


def draw_status(frame, hand_count, fps):
    label = f"Hands: {hand_count} | FPS: {fps:.1f} | Runs until q/Esc"
    cv2.rectangle(frame, (12, 12), (500, 50), (20, 20, 20), -1)
    cv2.putText(
        frame,
        label,
        (22, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )


def main():
    args = parse_args()

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(
            f"Could not open camera {args.camera}. Try --camera 1 or allow camera access."
        )

    mp_hands = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils
    mp_styles = mp.solutions.drawing_styles

    previous_time = time.time()
    fps = 0.0

    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=args.max_hands,
        model_complexity=1,
        min_detection_confidence=args.min_detection_confidence,
        min_tracking_confidence=args.min_tracking_confidence,
    ) as hands:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb_frame.flags.writeable = False
            results = hands.process(rgb_frame)
            rgb_frame.flags.writeable = True

            hand_count = 0
            if results.multi_hand_landmarks:
                hand_count = len(results.multi_hand_landmarks)
                for hand_landmarks in results.multi_hand_landmarks:
                    mp_drawing.draw_landmarks(
                        frame,
                        hand_landmarks,
                        mp_hands.HAND_CONNECTIONS,
                        mp_styles.get_default_hand_landmarks_style(),
                        mp_styles.get_default_hand_connections_style(),
                    )

            current_time = time.time()
            elapsed = current_time - previous_time
            previous_time = current_time
            if elapsed > 0:
                fps = 0.9 * fps + 0.1 * (1.0 / elapsed) if fps else 1.0 / elapsed

            draw_status(frame, hand_count, fps)
            cv2.imshow("MediaPipe Hand Landmarks", frame)

            key = cv2.waitKey(1) & 0xFF
            if key in (27, ord("q")):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
